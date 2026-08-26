/// <reference path="../pb_data/types.d.ts" />

// Audit helpers. Loaded via require() *inside* each hook handler, because
// PocketBase runs hook callbacks in an isolated context that cannot see
// module-level declarations in the .pb.js file.

const TRACKED = ["title", "price", "url", "note"];

function writeEvent(app, item, data) {
  const col = app.findCollectionByNameOrId("item_events");
  const rec = new Record(col, {
    item: item.id,
    board: item.getString("board"),
    event: data.event,
    field: data.field || "",
    from: (data.from || "").substring(0, 1000),
    to: (data.to || "").substring(0, 1000),
    detail: data.detail || "",
    source: data.source || "user",
  });
  app.save(rec);
}

function auditCreate(app, item) {
  const detail = item.getString("url")
    ? "from link"
    : item.getString("image")
      ? "from image"
      : "";
  writeEvent(app, item, { event: "created", detail: detail, source: "system" });
}

function auditUpdate(app, item) {
  const old = item.original();

  const wasBought = old.getBool("bought");
  const nowBought = item.getBool("bought");
  if (wasBought !== nowBought) {
    writeEvent(app, item, {
      event: nowBought ? "bought" : "unbought",
      field: "bought",
      from: String(wasBought),
      to: String(nowBought),
    });
  }

  for (let i = 0; i < TRACKED.length; i++) {
    const f = TRACKED[i];
    const o = old.getString(f);
    const n = item.getString(f);
    if (o !== n) {
      writeEvent(app, item, { event: "changed", field: f, from: o, to: n });
    }
  }

  const oImg = old.getString("image");
  const nImg = item.getString("image");
  if (oImg !== nImg) {
    writeEvent(app, item, {
      event: nImg ? "image_changed" : "image_removed",
      field: "image",
    });
  }
}

module.exports = { auditCreate, auditUpdate };
