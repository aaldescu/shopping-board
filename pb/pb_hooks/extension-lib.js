/// <reference path="../pb_data/types.d.ts" />

// Builds the Chrome extension download (see extension.pb.js). Loaded via
// require() inside each route handler.
//
// The extension's files ship in the image at /pb/extension (the repo's
// extension/ folder). On download, config.js is replaced with one that
// points at this server, and everything is zipped on the fly, so the
// extension works right after installing without any setup.

const FILES = [
  "manifest.json",
  "popup.html",
  "popup.css",
  "popup.js",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

const FOLDER = "shopping-board-extension/";

function extensionDir() {
  return $os.getenv("EXTENSION_DIR") || `${__hooks}/../extension`;
}

// Public address of this server as the browser sees it. APP_URL wins; else
// it's rebuilt from the request (Traefik sets X-Forwarded-Proto for HTTPS).
function serverUrl(e) {
  const fixed = ($os.getenv("APP_URL") || "").trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  const proto =
    (e.request.header.get("X-Forwarded-Proto") || "").split(",")[0].trim() ||
    (e.request.tls ? "https" : "http");
  const host = (e.request.header.get("X-Forwarded-Host") || "").split(",")[0].trim() || e.request.host;
  return proto + "://" + host;
}

function utf8(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      c = 0x10000 + ((c - 0xd800) << 10) + (str.charCodeAt(++i) - 0xdc00);
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

let crcTable = null;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable.push(c >>> 0);
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Minimal zip writer: stored (uncompressed) entries, which every unzip tool
// and OS reads. The extension is ~30 KB, so compression isn't worth it.
function zip(entries) {
  const out = [];
  const central = [];
  const u16 = (a, v) => a.push(v & 0xff, (v >>> 8) & 0xff);
  const u32 = (a, v) => a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  const append = (a, bytes) => {
    for (let i = 0; i < bytes.length; i++) a.push(bytes[i]);
  };
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const entry of entries) {
    const name = utf8(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const offset = out.length;

    u32(out, 0x04034b50); // local file header
    u16(out, 20); // version needed
    u16(out, 0x0800); // flags: UTF-8 names
    u16(out, 0); // method: stored
    u16(out, dosTime);
    u16(out, dosDate);
    u32(out, crc);
    u32(out, size);
    u32(out, size);
    u16(out, name.length);
    u16(out, 0); // extra length
    append(out, name);
    append(out, entry.data);

    u32(central, 0x02014b50); // central directory header
    u16(central, 20); // version made by
    u16(central, 20); // version needed
    u16(central, 0x0800);
    u16(central, 0);
    u16(central, dosTime);
    u16(central, dosDate);
    u32(central, crc);
    u32(central, size);
    u32(central, size);
    u16(central, name.length);
    u16(central, 0); // extra
    u16(central, 0); // comment
    u16(central, 0); // disk
    u16(central, 0); // internal attrs
    u32(central, 0); // external attrs
    u32(central, offset);
    append(central, name);
  }

  const centralOffset = out.length;
  append(out, central);
  u32(out, 0x06054b50); // end of central directory
  u16(out, 0);
  u16(out, 0);
  u16(out, entries.length);
  u16(out, entries.length);
  u32(out, central.length);
  u32(out, centralOffset);
  u16(out, 0);
  return out;
}

function buildZip(e) {
  const dir = extensionDir();
  const entries = FILES.map((name) => ({
    name: FOLDER + name,
    data: $os.readFile(dir + "/" + name),
  }));
  const config =
    "// Address of your Shopping Board server, filled in when you downloaded\n" +
    "// the extension. Edit it if the server moves to another domain.\n" +
    "const SERVER_URL = " + JSON.stringify(serverUrl(e)) + ";\n";
  entries.push({ name: FOLDER + "config.js", data: utf8(config) });
  return zip(entries);
}

function page(e) {
  const url = serverUrl(e);
  const host = url.replace(/^https?:\/\//, "");
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shopping Board · Chrome extension</title>
<style>
  :root { color-scheme: light dark; --accent: #4f46e5; --bg: #fff; --fg: #1f2937; --muted: #6b7280; --border: #e5e7eb; --soft: #f3f4f6; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111827; --fg: #f3f4f6; --muted: #9ca3af; --border: #374151; --soft: #1f2937; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 16px; font: 15px/1.55 system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--fg); }
  main { max-width: 560px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 6px; display: flex; align-items: center; gap: 10px; }
  p { color: var(--muted); margin: 0 0 18px; }
  .download { display: inline-block; padding: 11px 18px; border-radius: 9px; background: var(--accent); color: #fff; font-weight: 600; text-decoration: none; }
  ol { padding-left: 22px; margin: 24px 0; }
  li { margin-bottom: 10px; }
  code { background: var(--soft); padding: 1px 6px; border-radius: 5px; font-size: 13px; }
  a { color: var(--accent); }
  .note { font-size: 13px; }
</style>
</head>
<body><main>
  <h1><img src="/icon.svg" width="32" height="32" alt="">Chrome extension</h1>
  <p>Add the product you're looking at to a board with one click. The extension
  reads the page in your browser, so it also works on shops that block the
  server, and it's already set up for <b>${esc(host)}</b>.</p>
  <a class="download" href="/extension.zip" download>Download extension (.zip)</a>
  <ol>
    <li>Unzip the file. You get a <code>shopping-board-extension</code> folder;
      keep it somewhere it won't be deleted (Chrome loads it from there).</li>
    <li>Open <code>chrome://extensions</code> in a new tab (copy and paste it into the address bar).</li>
    <li>Turn on <b>Developer mode</b> (top right).</li>
    <li>Click <b>Load unpacked</b> and choose the <code>shopping-board-extension</code> folder.</li>
    <li>Pin it: click the puzzle icon in the toolbar, then the pin next to <b>Shopping Board</b>.</li>
    <li>On a product page, click the icon, sign in with your board account once, pick a board, and add.</li>
  </ol>
  <p class="note">Works in Chrome, Edge, Brave and other Chromium browsers on desktop.
  To update, download again, replace the folder's contents and press ↻ on the
  extension in <code>chrome://extensions</code>.</p>
  <p class="note"><a href="/">← Back to your boards</a></p>
</main></body>
</html>`;
}

module.exports = { buildZip, page };
