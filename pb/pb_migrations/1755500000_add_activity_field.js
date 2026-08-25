/// <reference path="../pb_data/types.d.ts" />

// Adds a per-item "activity" log (JSON array of {t, event, detail}).
migrate(
  (app) => {
    const items = app.findCollectionByNameOrId("items");
    items.fields.add(
      new Field({
        type: "json",
        name: "activity",
        maxSize: 50000,
      })
    );
    app.save(items);
  },
  (app) => {
    const items = app.findCollectionByNameOrId("items");
    items.fields.removeByName("activity");
    app.save(items);
  }
);
