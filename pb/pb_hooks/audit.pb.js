/// <reference path="../pb_data/types.d.ts" />

// Server-side audit trail for items. Every create/update to an item writes
// immutable rows to the item_events collection, recording exactly what
// changed (from -> to) regardless of which client made the change. Position
// fields (x/y/w) are intentionally ignored so dragging never floods the log.
//
// The actual logic lives in audit-lib.js and is require()d inside each
// handler — PocketBase runs hook callbacks in an isolated context that cannot
// see module-level declarations in this file.

onRecordAfterCreateSuccess((e) => {
  try {
    if (e.record) {
      require(`${__hooks}/audit-lib.js`).auditCreate(e.app, e.record);
    }
  } catch (err) {
    e.app.logger().warn("audit create failed", "error", String(err));
  }
  e.next();
}, "items");

onRecordAfterUpdateSuccess((e) => {
  try {
    if (e.record) {
      require(`${__hooks}/audit-lib.js`).auditUpdate(e.app, e.record);
    }
  } catch (err) {
    e.app.logger().warn("audit update failed", "error", String(err));
  }
  e.next();
}, "items");
