/// <reference path="../pb_data/types.d.ts" />

// Helpers for the /setup page (see setup.pb.js). Loaded via require() inside
// each route handler, because hook handlers can't see top-level variables.

// The token is the only thing standing between the internet and the admin
// account, so refuse short ones outright.
const MIN_TOKEN_LENGTH = 16;

function setupToken() {
  return ($os.getenv("SETUP_TOKEN") || "").trim();
}

// "" when /setup is usable, otherwise why it's disabled.
function disabledReason() {
  const token = setupToken();
  if (!token) {
    return "SETUP_TOKEN is not set.";
  }
  if (token.length < MIN_TOKEN_LENGTH) {
    return "SETUP_TOKEN is too short (minimum " + MIN_TOKEN_LENGTH + " characters).";
  }
  return "";
}

function tokenMatches(given) {
  // Constant-time compare so the token can't be guessed byte by byte.
  return $security.equal(String(given || ""), setupToken());
}

// Creates the superuser, or resets its password if the email already exists.
// Returns "" on success or a human-readable error.
function upsertSuperuser(app, email, password) {
  let record;
  try {
    record = app.findAuthRecordByEmail("_superusers", email);
  } catch (_) {
    record = new Record(app.findCollectionByNameOrId("_superusers"));
    record.setEmail(email);
  }
  record.setPassword(password);
  try {
    app.save(record);
  } catch (err) {
    return String(err).replace(/^.*?:\s*/, "") || "could not save the account";
  }
  return "";
}

function page(disabled) {
  const body = disabled
    ? `<h1>Setup is disabled</h1>
       <p>${disabled}</p>
       <p>To set or reset the admin account, add a long random
       <code>SETUP_TOKEN</code> in Dokploy → service → <em>Environment</em>,
       redeploy, and open this page again. Remove it when you're done.</p>`
    : `<h1>Admin setup</h1>
       <p>Creates the PocketBase admin (superuser), or resets its password if
       the email already exists. Your boards and data are not touched.</p>
       <form id="f">
         <label>Setup token<input name="token" type="password" required autocomplete="off"></label>
         <label>Admin email<input name="email" type="email" required autocomplete="username"></label>
         <label>New password<input name="password" type="password" required minlength="10" autocomplete="new-password"></label>
         <label>Repeat password<input name="password2" type="password" required minlength="10" autocomplete="new-password"></label>
         <button type="submit">Save admin account</button>
         <p id="msg" role="status"></p>
       </form>
       <script>
         const f = document.getElementById("f"), msg = document.getElementById("msg");
         f.addEventListener("submit", async (ev) => {
           ev.preventDefault();
           const d = Object.fromEntries(new FormData(f));
           msg.className = "";
           if (d.password !== d.password2) { msg.className = "err"; msg.textContent = "Passwords don't match."; return; }
           f.querySelector("button").disabled = true;
           msg.textContent = "Saving…";
           try {
             const res = await fetch("/api/setup", {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({ token: d.token, email: d.email, password: d.password }),
             });
             const out = await res.json().catch(() => ({}));
             if (!res.ok) throw new Error(out.error || "Request failed (" + res.status + ")");
             f.innerHTML = '<p class="ok">✅ Admin account saved for <b></b>.</p>' +
               '<p>Now remove <code>SETUP_TOKEN</code> from the environment and redeploy, ' +
               'then sign in at <a href="/_/">/_/</a>.</p>';
             f.querySelector("b").textContent = out.email;
           } catch (err) {
             msg.className = "err";
             msg.textContent = err.message;
             f.querySelector("button").disabled = false;
           }
         });
       </script>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Shopping Board · Setup</title>
<style>
  :root { color-scheme: light dark; --accent: #4f46e5; --bg: #fff; --fg: #1f2937; --muted: #6b7280; --border: #e5e7eb; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111827; --fg: #f3f4f6; --muted: #9ca3af; --border: #374151; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
         font: 15px/1.5 system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--fg); }
  main { width: 100%; max-width: 380px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { color: var(--muted); margin: 0 0 16px; }
  label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 12px; }
  input { display: block; width: 100%; margin-top: 4px; padding: 10px 12px; font: inherit;
          border: 1px solid var(--border); border-radius: 8px; background: transparent; color: inherit; }
  button { width: 100%; padding: 11px; border: 0; border-radius: 8px; background: var(--accent);
           color: #fff; font: inherit; font-weight: 600; cursor: pointer; margin-top: 4px; }
  button:disabled { opacity: .6; cursor: default; }
  code { font-size: 13px; }
  a { color: var(--accent); }
  #msg { margin: 12px 0 0; min-height: 1.5em; }
  .err { color: #dc2626; }
  .ok { color: var(--fg); }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

module.exports = { disabledReason, tokenMatches, upsertSuperuser, page };
