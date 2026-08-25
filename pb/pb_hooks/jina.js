/// <reference path="../pb_data/types.d.ts" />

// Optional Jina Reader fallback for /api/og-preview.
//
// Jina Reader (https://jina.ai/reader) fetches a URL with a real, JS-rendering
// browser and returns clean content + metadata. This recovers product pages
// that block our plain server fetch, or that only inject the image/price via
// JavaScript after load (so a raw fetch sees text but no og:image).
//
// Enable with either env var:
//   JINA_API_KEY   - use the authenticated endpoint (higher rate limits)
//   JINA_ENABLED   - "true"/"1"/"yes" to use the free keyless endpoint
// Optional:
//   JINA_BASE_URL  - default "https://r.jina.ai"

function jinaConfig() {
  const key = $os.getenv("JINA_API_KEY");
  const flag = $os.getenv("JINA_ENABLED") || "";
  if (!key && !/^(1|true|yes|on)$/i.test(flag)) return null;
  return {
    key: key,
    base: ($os.getenv("JINA_BASE_URL") || "https://r.jina.ai").replace(/\/+$/, ""),
  };
}

// Returns { ok, title, description, image, content, status?, error? }.
function fetchViaJina(cfg, url) {
  try {
    const headers = {
      Accept: "application/json",
      "X-Return-Format": "markdown",
      // Ask Jina to also surface the image alt->src map in the JSON.
      "X-With-Images-Summary": "true",
    };
    if (cfg.key) headers.Authorization = "Bearer " + cfg.key;

    const res = $http.send({
      url: cfg.base + "/" + url,
      method: "GET",
      timeout: 45,
      headers: headers,
    });
    if (res.statusCode !== 200) {
      return { ok: false, status: res.statusCode };
    }
    const data = res.json && res.json.data ? res.json.data : null;
    if (!data) return { ok: false, status: res.statusCode };

    // data.images is a map of { altText: absoluteUrl }. Pick the first
    // https image as a reasonable product-image guess; the AI step can
    // still override using the full content if it finds a better one.
    let image = "";
    if (data.images && typeof data.images === "object") {
      for (const k in data.images) {
        const v = data.images[k];
        if (typeof v === "string" && /^https?:\/\//i.test(v)) {
          image = v;
          break;
        }
      }
    }

    return {
      ok: true,
      title: typeof data.title === "string" ? data.title : "",
      description: typeof data.description === "string" ? data.description : "",
      image: image,
      content: typeof data.content === "string" ? data.content : "",
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

module.exports = { jinaConfig, fetchViaJina };
