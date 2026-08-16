/// <reference path="../pb_data/types.d.ts" />

// Creates the "boards" and "items" collections used by the Shopping Board app.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const boards = new Collection({
      type: "base",
      name: "boards",
      listRule: "@request.auth.id != '' && owner = @request.auth.id",
      viewRule: "@request.auth.id != '' && owner = @request.auth.id",
      createRule: "@request.auth.id != '' && owner = @request.auth.id",
      updateRule: "@request.auth.id != '' && owner = @request.auth.id",
      deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
      fields: [
        {
          type: "text",
          name: "name",
          required: true,
          max: 200,
        },
        {
          type: "relation",
          name: "owner",
          required: true,
          collectionId: users.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          type: "autodate",
          name: "created",
          onCreate: true,
        },
        {
          type: "autodate",
          name: "updated",
          onCreate: true,
          onUpdate: true,
        },
      ],
    });
    app.save(boards);

    const items = new Collection({
      type: "base",
      name: "items",
      listRule: "@request.auth.id != '' && board.owner = @request.auth.id",
      viewRule: "@request.auth.id != '' && board.owner = @request.auth.id",
      createRule: "@request.auth.id != '' && board.owner = @request.auth.id",
      updateRule: "@request.auth.id != '' && board.owner = @request.auth.id",
      deleteRule: "@request.auth.id != '' && board.owner = @request.auth.id",
      fields: [
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
          name: "title",
          max: 500,
        },
        {
          type: "text",
          name: "price",
          max: 100,
        },
        {
          type: "url",
          name: "url",
        },
        {
          type: "url",
          name: "image_url",
        },
        {
          type: "file",
          name: "image",
          maxSelect: 1,
          maxSize: 15728640,
          mimeTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/avif",
            "image/svg+xml",
          ],
        },
        {
          type: "number",
          name: "x",
        },
        {
          type: "number",
          name: "y",
        },
        {
          type: "number",
          name: "w",
        },
        {
          type: "text",
          name: "note",
          max: 2000,
        },
        {
          type: "autodate",
          name: "created",
          onCreate: true,
        },
        {
          type: "autodate",
          name: "updated",
          onCreate: true,
          onUpdate: true,
        },
      ],
    });
    app.save(items);
  },
  (app) => {
    for (const name of ["items", "boards"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {
        // already removed
      }
    }
  }
);
