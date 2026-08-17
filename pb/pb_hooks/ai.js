/// <reference path="../pb_data/types.d.ts" />

// Optional AI-assisted product extraction for /api/og-preview.
//
// Enabled by setting the OPENAI_API_KEY environment variable on the
// container. Uses an OpenAI (or OpenAI-compatible) API:
//   OPENAI_API_KEY   - required to enable the fallback
//   OPENAI_MODEL     - default "gpt-5-mini"
//   OPENAI_BASE_URL  - default "https://api.openai.com/v1"
//
// Two strategies:
//   - extractFromHtml: we fetched the page but classic OG/JSON-LD parsing
//     came back incomplete -> let the model read a condensed version.
//   - extractViaWebSearch: the shop blocked our server -> ask the model to
//     visit the URL itself via the web_search tool (OpenAI Responses API).

const FIELDS =
  '{"title": string, "price": string (number only, e.g. "89.99", or ""), ' +
  '"currency": string (ISO 4217, e.g. "RON", or ""), ' +
  '"image": string (absolute https URL of the main product image, or ""), ' +
  '"siteName": string, "description": string (max 200 chars)}';

function aiConfig() {
  const key = $os.getenv("OPENAI_API_KEY");
  if (!key) return null;
  return {
    key: key,
    model: $os.getenv("OPENAI_MODEL") || "gpt-5-mini",
    baseUrl: ($os.getenv("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, ""),
  };
}

function parseJsonLoose(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(t.substring(start, end + 1));
    return obj && typeof obj === "object" ? obj : null;
  } catch (_) {
    return null;
  }
}

function sanitize(obj) {
  if (!obj) return null;
  const s = (v) => (typeof v === "string" ? v.trim() : "");
  const out = {
    title: s(obj.title).substring(0, 500),
    price: s(obj.price).replace(/[^0-9.,]/g, "").substring(0, 20),
    currency: /^[A-Za-z]{3}$/.test(s(obj.currency)) ? s(obj.currency).toUpperCase() : "",
    image: /^https?:\/\//i.test(s(obj.image)) ? s(obj.image) : "",
    siteName: s(obj.siteName).substring(0, 200),
    description: s(obj.description).substring(0, 1000),
  };
  return out.title || out.image || out.price ? out : null;
}

// Boil a product page down to the parts that matter for extraction.
function condenseHtml(html) {
  const parts = [];
  const head = html.match(/<head[\s\S]*?<\/head>/i);
  if (head) {
    parts.push(head[0].replace(/<style[\s\S]*?<\/style>/gi, " ").substring(0, 25000));
  }
  const lds = html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const ld of lds.slice(0, 5)) parts.push(ld.substring(0, 12000));
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  parts.push(bodyText.substring(0, 8000));
  return parts.join("\n").substring(0, 60000);
}

function extractFromHtml(cfg, url, html) {
  try {
    const res = $http.send({
      url: cfg.baseUrl + "/chat/completions",
      method: "POST",
      timeout: 60,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + cfg.key,
      },
      body: JSON.stringify({
        model: cfg.model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content:
              "Below is condensed HTML of a shop product page (" +
              url +
              "). Extract the product info and reply with ONLY a JSON object shaped as " +
              FIELDS +
              ". Use empty strings for anything not present.\n\n" +
              condenseHtml(html),
          },
        ],
      }),
    });
    if (res.statusCode !== 200) return null;
    const content =
      res.json && res.json.choices && res.json.choices[0] && res.json.choices[0].message
        ? res.json.choices[0].message.content
        : "";
    return sanitize(parseJsonLoose(content));
  } catch (_) {
    return null;
  }
}

function extractViaWebSearch(cfg, url) {
  try {
    const res = $http.send({
      url: cfg.baseUrl + "/responses",
      method: "POST",
      timeout: 90,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + cfg.key,
      },
      body: JSON.stringify({
        model: cfg.model,
        tools: [{ type: "web_search" }],
        input:
          "Look up this exact product page: " +
          url +
          "\nFind the product's name, current price, currency, main product image URL, " +
          "shop name and a one-sentence description. Reply with ONLY a JSON object shaped as " +
          FIELDS +
          ". Use empty strings for anything you cannot determine.",
      }),
    });
    if (res.statusCode !== 200) return null;
    let text = "";
    const output = res.json && res.json.output;
    if (Array.isArray(output)) {
      for (const item of output) {
        if (item && item.type === "message" && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c && c.type === "output_text" && c.text) text += c.text;
          }
        }
      }
    }
    return sanitize(parseJsonLoose(text));
  } catch (_) {
    return null;
  }
}

module.exports = { aiConfig, extractFromHtml, extractViaWebSearch };
