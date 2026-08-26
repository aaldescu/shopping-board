/// <reference path="../pb_data/types.d.ts" />

// Audit trail: one immutable row per change to an item.
// Rows are written only by the server audit hooks (see pb_hooks/audit.pb.js),
// so clients can read their own board's events but cannot forge them.
migrate(
  (app) => {
    const items = app.findCollectionByNameOrId("items");
    const boards = app.findCollectionByNameOrId("boards");

    const events = new Collection({
      type: "base",
      name: "item_events",
      // Read-only to owners; no client create/update/delete (system writes only).
      listRule: "@request.auth.id != '' && board.owner = @request.auth.id",
      viewRule: "@request.auth.id != '' && board.owner = @request.auth.id",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          type: "relation",
          name: "item",
          required: true,
          collectionId: items.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          type: "relation",
          name: "board",
          required: true,
          collectionId: boards.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          type: "text",
          name: "event",
          required: true,
          max: 50,
        },
        {
          type: "text",
          name: "field",
          max: 50,
        },
        {
          type: "text",
          name: "from",
          max: 1000,
        },
        {
          type: "text",
          name: "to",
          max: 1000,
        },
        {
          type: "text",
          name: "detail",
          max: 1000,
        },
        {
          type: "text",
          name: "source",
          max: 20,
        },
        {
          type: "autodate",
          name: "created",
          onCreate: true,
        },
      ],
      indexes: [
        "CREATE INDEX idx_item_events_item ON item_events (item, created)",
      ],
    });
    app.save(events);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("item_events"));
    } catch (_) {
      // already removed
    }
  }
);
