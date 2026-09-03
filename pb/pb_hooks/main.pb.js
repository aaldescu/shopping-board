/// <reference path="../pb_data/types.d.ts" />

// Custom API routes for the Shopping Board app.
//
// GET /api/og-preview?url=...  -> {title, image, price, currency, siteName, description}
//    Fetches a (product) page server-side and extracts Open Graph / meta info,
//    so the client can prefill a card from a pasted shop URL.
//
// GET /api/img?url=...         -> raw image bytes
//    Same-origin image proxy so the client can download a product image and
//    store a durable copy in the item's file field.
//
// Both routes require an authenticated user.

routerAdd(
  "GET",
  "/api/og-preview",
  (e) => {
    const utils = require(`${__hooks}/utils.js`);
    const ai = require(`${__hooks}/ai.js`);
    const url = (e.request.url.query().get("url") || "").trim();
    const err = utils.sbValidateUrl(url);
    if (err) {
      return e.json(400, { error: err });
    }

    // Step-by-step trace so both the admin log and the browser console can
    // show exactly what happened for this URL.
    const trace = [];
    const step = (name, info) => trace.push(Object.assign({ step: name }, info || {}));

    let html = "";
    let fetchProblem = "";
    try {
      const res = $http.send({
        url: url,
        method: "GET",
        timeout: 20,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (res.statusCode >= 200 && res.statusCode < 400) {
        html = toString(res.body).substring(0, 1500000);
        step("fetch", { ok: true, status: res.statusCode, htmlBytes: html.length });
      } else {
        fetchProblem = "page responded with status " + res.statusCode;
        step("fetch", { ok: false, status: res.statusCode });
      }
    } catch (fetchErr) {
      fetchProblem = "could not fetch the page";
      step("fetch", { ok: false, error: String(fetchErr) });
    }

    const meta = (name) => {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let m = html.match(
        new RegExp(
          "<meta[^>]+(?:property|name|itemprop)\\s*=\\s*[\"']" +
            esc +
            "[\"'][^>]*?content\\s*=\\s*[\"']([^\"']+)[\"']",
          "i"
        )
      );
      if (!m) {
        m = html.match(
          new RegExp(
            "<meta[^>]+content\\s*=\\s*[\"']([^\"']+)[\"'][^>]*?(?:property|name|itemprop)\\s*=\\s*[\"']" +
              esc +
              "[\"']",
            "i"
          )
        );
      }
      return m ? utils.sbDecodeEntities(m[1].trim()) : "";
    };

    let title = meta("og:title") || meta("twitter:title");
    if (!title) {
      const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      title = t ? utils.sbDecodeEntities(t[1].replace(/\s+/g, " ").trim()) : "";
    }

    let image =
      meta("og:image") ||
      meta("og:image:url") ||
      meta("og:image:secure_url") ||
      meta("twitter:image") ||
      meta("twitter:image:src") ||
      meta("image");

    let price =
      meta("product:price:amount") ||
      meta("og:price:amount") ||
      meta("product:sale_price:amount") ||
      meta("twitter:data1") ||
      meta("price");

    let currency =
      meta("product:price:currency") ||
      meta("og:price:currency") ||
      meta("priceCurrency");

    // JSON-LD fallback for price/currency (very common on shops).
    if (!price) {
      const ld = html.match(/"price"\s*:\s*"?([0-9][0-9.,]{0,15})"?/);
      if (ld) price = ld[1];
    }
    if (!currency) {
      const ldc = html.match(/"priceCurrency"\s*:\s*"([A-Za-z]{3})"/);
      if (ldc) currency = ldc[1];
    }
    // Only keep prices that look like a number.
    if (price && !/^[0-9][0-9.,\s]*$/.test(price)) price = "";

    // Resolve relative/protocol-relative image URLs.
    if (image) {
      const originMatch = url.match(/^https?:\/\/[^\/]+/i);
      const origin = originMatch ? originMatch[0] : "";
      if (image.indexOf("//") === 0) {
        image = "https:" + image;
      } else if (image.indexOf("/") === 0) {
        image = origin + image;
      } else if (!/^https?:\/\//i.test(image)) {
        image = "";
      }
    }

    let siteName = meta("og:site_name");
    let description = meta("og:description").substring(0, 1000);

    step("parse", {
      title: !!title,
      image: !!image,
      price: !!price,
      currency: currency || "",
    });

    // Jina Reader fallback (optional): a JS-rendering fetch that recovers
    // pages we couldn't read or images injected by client-side JS. Its
    // rendered content also feeds the AI step below for better extraction.
    const jina = require(`${__hooks}/jina.js`);
    const jcfg = jina.jinaConfig();
    if (jcfg && (fetchProblem || !image || !title)) {
      const j = jina.fetchViaJina(jcfg, url);
      if (j.ok) {
        const filled = [];
        if (!title && j.title) filled.push("title");
        if (!image && j.image) filled.push("image");
        if (!title && j.title) title = j.title;
        if (!image && j.image) image = j.image;
        if (!description && j.description) description = j.description.substring(0, 1000);
        if (j.content) {
          html = j.content; // give the AI step rendered content to work on
          fetchProblem = "";
        }
        step("jina", {
          ok: true,
          filled: filled,
          contentBytes: (j.content || "").length,
        });
      } else {
        step("jina", { ok: false, status: j.status, error: j.error });
      }
    }

    // AI fallback (optional, needs OPENAI_API_KEY): fill in what classic
    // OG/JSON-LD parsing could not - or handle pages that blocked us.
    const cfg = ai.aiConfig();
    if (cfg && (!title || !image || !price)) {
      const mode = html ? "html" : "web_search";
      const extra = html
        ? ai.extractFromHtml(cfg, url, html)
        : ai.extractViaWebSearch(cfg, url);
      if (extra) {
        const filled = [];
        if (!title && extra.title) filled.push("title");
        if (!image && extra.image) filled.push("image");
        if (!price && extra.price) filled.push("price");
        title = title || extra.title;
        image = image || extra.image;
        price = price || extra.price;
        currency = currency || extra.currency;
        siteName = siteName || extra.siteName;
        description = description || extra.description;
        step("ai", { mode: mode, model: cfg.model, ok: true, filled: filled });
      } else {
        step("ai", { mode: mode, model: cfg.model, ok: false });
      }
    } else if (!cfg && (!title || !image || !price)) {
      step("ai", { skipped: "no OPENAI_API_KEY set" });
    }

    step("result", { title: !!title, image: image || "", price: price || "" });

    // One structured line in the PocketBase admin log per lookup.
    $app.logger().info(
      "og-preview",
      "url", url,
      "gotTitle", !!title,
      "gotImage", !!image,
      "gotPrice", !!price,
      "trace", JSON.stringify(trace)
    );

    if (fetchProblem && !title && !image && !price) {
      return e.json(502, { error: fetchProblem, trace: trace });
    }

    return e.json(200, {
      title: title.substring(0, 500),
      image: image,
      price: price,
      currency: currency,
      siteName: siteName,
      description: description,
      trace: trace,
    });
  },
  $apis.requireAuth()
);

// GET /api/og-images?url=...  -> { images: [url, url, ...] }
//    Returns candidate product images from a page so the user can pick a
//    better picture than the default og:image.
routerAdd(
  "GET",
  "/api/og-images",
  (e) => {
    const utils = require(`${__hooks}/utils.js`);
    const images = require(`${__hooks}/images.js`);
    const jina = require(`${__hooks}/jina.js`);
    const url = (e.request.url.query().get("url") || "").trim();
    const err = utils.sbValidateUrl(url);
    if (err) {
      return e.json(400, { error: err });
    }

    let html = "";
    try {
      const res = $http.send({
        url: url,
        method: "GET",
        timeout: 20,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (res.statusCode >= 200 && res.statusCode < 400) {
        html = toString(res.body).substring(0, 1500000);
      }
    } catch (fetchErr) {
      // fall through to Jina below
    }

    let list = images.collectImages(html, url);

    // If direct fetch was blocked or thin, add JS-rendered images via Jina.
    const jcfg = jina.jinaConfig();
    if (jcfg && list.length < 4) {
      const j = jina.fetchViaJina(jcfg, url);
      if (j.ok) {
        const merged = {};
        const combined = [];
        const add = (u) => {
          if (u && !merged[u]) {
            merged[u] = true;
            combined.push(u);
          }
        };
        list.forEach(add);
        (j.images || []).forEach(add);
        images.collectImages(j.content || "", url).forEach(add);
        list = combined;
      }
    }

    $app.logger().info("og-images", "url", url, "count", list.length);
    return e.json(200, { images: list.slice(0, 30) });
  },
  $apis.requireAuth()
);

routerAdd(
  "GET",
  "/api/img",
  (e) => {
    const utils = require(`${__hooks}/utils.js`);
    const url = (e.request.url.query().get("url") || "").trim();
    const err = utils.sbValidateUrl(url);
    if (err) {
      return e.json(400, { error: err });
    }

    let res;
    try {
      res = $http.send({
        url: url,
        method: "GET",
        timeout: 30,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
          Referer: url,
        },
      });
    } catch (fetchErr) {
      $app.logger().warn("img-proxy failed", "url", url, "error", String(fetchErr));
      return e.json(502, { error: "could not fetch the image" });
    }

    if (res.statusCode !== 200) {
      $app.logger().warn("img-proxy blocked", "url", url, "status", res.statusCode);
      return e.json(502, { error: "image responded with status " + res.statusCode });
    }

    let contentType = "image/jpeg";
    const headers = res.headers || {};
    for (const key in headers) {
      if (key.toLowerCase() === "content-type") {
        const v = headers[key];
        contentType = Array.isArray(v) ? v[0] : String(v);
        break;
      }
    }
    if (contentType.indexOf("image/") !== 0) {
      $app.logger().warn("img-proxy not-an-image", "url", url, "contentType", contentType);
      return e.json(415, { error: "url is not an image (" + contentType + ")" });
    }

    return e.blob(200, contentType, res.body);
  },
  $apis.requireAuth()
);
