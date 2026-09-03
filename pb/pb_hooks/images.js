/// <reference path="../pb_data/types.d.ts" />

// Collects candidate image URLs from a product page's HTML (or Jina markdown),
// used by the /api/og-images route so the user can pick a better picture.
// Loaded via require() inside the route handler.

function resolveUrl(u, baseUrl) {
  if (!u) return "";
  u = u.trim().replace(/&amp;/g, "&");
  if (u.indexOf("data:") === 0) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const orig = baseUrl.match(/^https?:\/\/[^\/]+/i);
  const origin = orig ? orig[0] : "";
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.indexOf("/") === 0) return origin + u;
  // path-relative: resolve against the directory of the base URL
  const noQuery = baseUrl.split(/[?#]/)[0];
  const dir = noQuery.substring(0, noQuery.lastIndexOf("/") + 1);
  return dir + u;
}

// Filters out sprites, icons, logos, tracking pixels, etc.
function looksJunk(u) {
  const l = u.toLowerCase();
  if (/\.svg(\?|$)/.test(l)) return true;
  if (/(sprite|favicon|logo|icon|placeholder|pixel|blank|spinner|loading|1x1|transparent|gif;base64)/.test(l))
    return true;
  // tiny declared dimensions like 16x16, 32x32, 50x50
  if (/[\/_\-](\d{1,2})x(\d{1,2})[\/_.]/.test(l)) return true;
  return false;
}

function pickFromSrcset(srcset, baseUrl) {
  const parts = srcset.split(",");
  let best = "";
  let bestW = -1;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i].trim().split(/\s+/);
    if (!seg[0]) continue;
    let w = 0;
    if (seg[1]) {
      const mw = seg[1].match(/(\d+)w/);
      if (mw) w = parseInt(mw[1], 10);
      const md = seg[1].match(/([\d.]+)x/);
      if (md) w = parseFloat(md[1]) * 1000;
    }
    if (w >= bestW) {
      bestW = w;
      best = seg[0];
    }
  }
  return best;
}

function collectImages(html, baseUrl) {
  if (!html) return [];
  const out = [];
  const seen = {};
  let m;

  const push = (u) => {
    const r = resolveUrl(u, baseUrl);
    if (!r || !/^https?:\/\//i.test(r)) return;
    if (looksJunk(r)) return;
    if (seen[r]) return;
    seen[r] = true;
    out.push(r);
  };

  // 1. og:image / twitter:image meta (highest priority, added first).
  const metaRe =
    /<meta[^>]+(?:property|name)\s*=\s*["'](?:og:image(?::(?:url|secure_url))?|twitter:image(?::src)?)["'][^>]*content\s*=\s*["']([^"']+)["']/gi;
  while ((m = metaRe.exec(html))) push(m[1]);
  const metaRe2 =
    /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*(?:property|name)\s*=\s*["'](?:og:image(?::(?:url|secure_url))?|twitter:image(?::src)?)["']/gi;
  while ((m = metaRe2.exec(html))) push(m[1]);

  // 2. JSON-LD image / contentUrl fields.
  const ldRe = /"(?:image|contentUrl)"\s*:\s*"([^"]+)"/gi;
  while ((m = ldRe.exec(html))) push(m[1]);
  const ldArrRe = /"image"\s*:\s*\[([^\]]+)\]/gi;
  while ((m = ldArrRe.exec(html))) {
    const inner = m[1];
    let mm;
    const urlRe = /"([^"]+)"/g;
    while ((mm = urlRe.exec(inner))) push(mm[1]);
  }

  // 3. <img> tags: srcset (largest) + common lazy-load attributes + src.
  const imgRe = /<img\b[^>]*>/gi;
  const imgAttrs = [
    "data-zoom-image",
    "data-large_image",
    "data-image",
    "data-src",
    "data-lazy-src",
    "data-original",
    "src",
  ];
  while ((m = imgRe.exec(html))) {
    const tag = m[0];
    const ss = tag.match(/srcset\s*=\s*["']([^"']+)["']/i);
    if (ss) push(pickFromSrcset(ss[1], baseUrl));
    for (let i = 0; i < imgAttrs.length; i++) {
      const mm = tag.match(new RegExp(imgAttrs[i] + '\\s*=\\s*["\']([^"\']+)["\']', "i"));
      if (mm) push(mm[1]);
    }
  }

  // 4. <source srcset> (picture elements).
  const srcRe = /<source\b[^>]*srcset\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = srcRe.exec(html))) push(pickFromSrcset(m[1], baseUrl));

  // 5. <link rel="preload" as="image" href>.
  const linkRe = /<link\b[^>]*>/gi;
  while ((m = linkRe.exec(html))) {
    if (!/rel\s*=\s*["']preload["']/i.test(m[0])) continue;
    if (!/as\s*=\s*["']image["']/i.test(m[0])) continue;
    const href = m[0].match(/href\s*=\s*["']([^"']+)["']/i);
    if (href) push(href[1]);
  }

  // 6. Markdown images (from Jina Reader content).
  const mdRe = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi;
  while ((m = mdRe.exec(html))) push(m[1]);

  return out.slice(0, 30);
}

module.exports = { collectImages };
