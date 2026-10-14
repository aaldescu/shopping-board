/// <reference path="../pb_data/types.d.ts" />

// /extension: install page for the Chrome extension.
// /extension.zip: the extension itself, with this server's address already
// filled in (see extension-lib.js).

routerAdd("GET", "/extension", (e) => {
  const ext = require(`${__hooks}/extension-lib.js`);
  return e.html(200, ext.page(e));
});

routerAdd("GET", "/extension.zip", (e) => {
  const ext = require(`${__hooks}/extension-lib.js`);
  let bytes;
  try {
    bytes = ext.buildZip(e);
  } catch (err) {
    e.app.logger().error("extension zip failed", "error", String(err));
    return e.json(500, { error: "could not build the extension" });
  }
  e.response.header().set("Content-Disposition", 'attachment; filename="shopping-board-extension.zip"');
  e.response.header().set("Cache-Control", "no-store");
  return e.blob(200, "application/zip", bytes);
});
