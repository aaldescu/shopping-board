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
        timeout: 20,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } catch (fetchErr) {
      return e.json(502, { error: "could not fetch the page" });
    }

    if (res.statusCode < 200 || res.statusCode >= 400) {
      return e.json(502, { error: "page responded with status " + res.statusCode });
    }

    const html = toString(res.body).substring(0, 1500000);

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

    return e.json(200, {
      title: title.substring(0, 500),
      image: image,
      price: price,
      currency: currency,
      siteName: meta("og:site_name"),
      description: meta("og:description").substring(0, 1000),
    });
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
      return e.json(502, { error: "could not fetch the image" });
    }

    if (res.statusCode !== 200) {
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
      return e.json(415, { error: "url is not an image (" + contentType + ")" });
    }

    return e.blob(200, contentType, res.body);
  },
  $apis.requireAuth()
);
