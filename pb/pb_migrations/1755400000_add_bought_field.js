/// <reference path="../pb_data/types.d.ts" />

// Adds the "bought" flag to items.
migrate(
  (app) => {
    const items = app.findCollectionByNameOrId("items");
    items.fields.add(
      new Field({
        type: "bool",
        name: "bought",
      })
    );
    app.save(items);
  },
  (app) => {
    const items = app.findCollectionByNameOrId("items");
    items.fields.removeByName("bought");
    app.save(items);
  }
);
