/// <reference path="../pb_data/types.d.ts" />

// /setup: create the PocketBase admin (superuser) or reset its password from
// the browser, instead of `docker exec … pocketbase superuser upsert`.
//
// Locked unless SETUP_TOKEN is set in the server environment, and every
// request must present that token. So only someone who can change the
// server's environment (i.e. you, in Dokploy) can use it. Set the token,
// use the page, then remove the token again.
//
//   SETUP_TOKEN   long random string (min 16 chars); empty = /setup disabled

routerAdd("GET", "/setup", (e) => {
  const setup = require(`${__hooks}/setup-lib.js`);
  e.response.header().set("Cache-Control", "no-store");
  return e.html(200, setup.page(setup.disabledReason()));
});

routerAdd("POST", "/api/setup", (e) => {
  const setup = require(`${__hooks}/setup-lib.js`);

  const disabled = setup.disabledReason();
  if (disabled) {
    return e.json(403, { error: "Setup is disabled: " + disabled });
  }

  const body = e.requestInfo().body || {};
  if (!setup.tokenMatches(body.token)) {
    // Slow down guessing; the token length already makes it impractical.
    sleep(1000);
    e.app.logger().warn("setup: wrong token", "ip", e.realIP());
    return e.json(403, { error: "Wrong setup token." });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) {
    return e.json(400, { error: "Email and password are required." });
  }

  const problem = setup.upsertSuperuser(e.app, email, password);
  if (problem) {
    return e.json(400, { error: problem });
  }

  e.app.logger().info("setup: superuser saved", "email", email, "ip", e.realIP());
  return e.json(200, { email: email });
});
