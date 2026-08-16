/// <reference path="../pb_data/types.d.ts" />

// Shared helpers for the route handlers in main.pb.js.
// PocketBase route handlers run in isolated executors, so each handler
// loads this module with require(`${__hooks}/utils.js`).

function sbValidateUrl(url) {
  if (!/^https?:\/\/[^\s]+$/i.test(url)) {
    return "missing or invalid url parameter";
  }
  const hostMatch = url.match(/^https?:\/\/([^\/:?#]+)/i);
  const host = hostMatch ? hostMatch[1].toLowerCase() : "";
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
    /^\[?::1\]?$/.test(host) ||
    /\.local$/.test(host) ||
    /\.internal$/.test(host)
  ) {
    return "url host is not allowed";
  }
  return "";
}

function sbDecodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ");
}

module.exports = { sbValidateUrl, sbDecodeEntities };
