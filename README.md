# 🛍️ Shopping Board

A mood board, but for shopping. Collect products you want to buy on an
infinite canvas — with pictures, prices and links back to the shop.

Built with **React + TypeScript + Vite** on the frontend and
**[PocketBase](https://pocketbase.io)** (auth, database, file storage) on the
backend. In production a single container runs PocketBase, which also serves
the built frontend — one process, one port, one volume.

## Features

- **Infinite canvas** — Excalidraw/Notion-style board:
  - two-finger pan and pinch-to-zoom on mobile
  - mouse wheel / trackpad pan, `Ctrl`/`⌘` + wheel to zoom on desktop
  - drag cards anywhere, resize them with the corner handle
- **Add products from a URL** — paste a shop link and the server fetches the
  page's Open Graph metadata (title, picture, price when available) and stores
  a durable copy of the image
- **Add pictures directly** — upload, paste from the clipboard, or drag &
  drop image files onto the board
- **Share from your phone** — installed as a PWA (Android/Chrome), the app
  appears in the native share sheet: share a shop URL, pick a board, done
- **Audit trail** — every card keeps a server-recorded history (added, price
  changes with from→to, bought/not-bought, title/note/image edits), shown in
  the card's Activity section. Recorded by server hooks, so it's complete and
  can't be forged by the client; dragging a card is not logged.
- **Refetch** — a 🔄 button on a card re-reads its URL to refresh the price;
  any change lands in the audit trail.
- **Backups** — scheduled PocketBase backups (database + uploaded images),
  optionally pushed off-site to S3-compatible storage, configured by
  environment variable so a rebuilt server protects itself from first boot
- **Pick a better image** — in the edit dialog, the 🖼️ button pulls all the
  images found on the product page (og:image, gallery images, JSON-LD, Jina
  when configured) into a grid so you can choose the one you like.
- **Boards** — create, rename, delete; each user only sees their own
- **User accounts** — email + password login backed by PocketBase
- **Live sync** — boards update in realtime across devices via PocketBase
  subscriptions

## Project layout

```
├── web/                  # React frontend (Vite)
├── pb/
│   ├── pb_migrations/    # creates the boards/items collections on first run
│   └── pb_hooks/         # /api/og-preview + /api/img custom routes
├── Dockerfile            # builds frontend, bundles PocketBase
└── docker-compose.yml    # for Dokploy / docker compose
```

## Local development

1. **PocketBase** (backend) — download the [PocketBase binary](https://pocketbase.io/docs/)
   (v0.28.x) and run:

   ```sh
   pocketbase serve --http=127.0.0.1:8090 \
     --migrationsDir=pb/pb_migrations \
     --hooksDir=pb/pb_hooks
   ```

   Migrations run automatically and create the `boards` and `items`
   collections.

2. **Frontend**:

   ```sh
   cd web
   npm install
   npm run dev
   ```

   Open http://localhost:5173 — Vite proxies `/api` to PocketBase.

## Deploying on Dokploy

The repo ships a `Dockerfile` and `docker-compose.yml` ready for Dokploy.

1. **Create the service** — in Dokploy: *Create Service → Compose*, point it
   at this Git repository (Compose path: `./docker-compose.yml`).

2. **Persistent volume** — the compose file mounts `../files/pb_data` into
   the container at `/pb/pb_data`. Dokploy keeps the `../files` directory on
   a persistent host path, so the SQLite database and all uploaded images
   survive redeploys and rebuilds. (If you deploy without Dokploy, switch to
   the named-volume variant commented in `docker-compose.yml`.)

3. **Domain + SSL** — the compose file carries the Traefik labels for TLS:
   an HTTP router with the `redirect-to-https@file` middleware and an HTTPS
   router using the `letsencrypt` certificate resolver, with the container
   joined to the external `dokploy-network`. All you have to do:
   - point the subdomain's DNS A-record at your Dokploy server;
   - in the service's *Environment* tab set `DOMAIN=board.example.com`
     (your subdomain) and redeploy.

   No entry in the *Domains* tab is needed — the labels do the routing. If
   you prefer managing the domain from the Dokploy UI instead, delete the
   `labels:` block and add the domain in the *Domains* tab (port **8080**,
   HTTPS + Let's Encrypt).

4. **Deploy**, then create the PocketBase superuser (admin) account:

   ```sh
   docker exec -it <container> pocketbase superuser upsert you@example.com <password> --dir /pb/pb_data
   ```

   The admin dashboard is at `https://board.example.com/_/`.

5. Open `https://board.example.com`, sign up, and start pinning products.

> **PWA share target:** HTTPS is required. After installing the app to the
> home screen (Android/Chrome), "Shopping Board" shows up in the share sheet
> for links — sharing a product URL lands on a board picker.

## AI-assisted scraping (optional)

Classic Open Graph scraping fails on JavaScript-heavy shops or shops with
bot protection (Lidl, Amazon, …). `/api/og-preview` runs a series of
fallbacks, each only when the previous one left fields missing:

1. Plain OG/JSON-LD extraction — if it finds title, image and price,
   **nothing else runs** (fast and free).
2. **Jina Reader** (if configured) — a JS-rendering fetch that recovers
   pages we couldn't read, or images injected by client-side JS (the common
   "got the price but no image" case). Its rendered content also feeds
   step 3.
3. **OpenAI HTML extraction** (if configured) — a condensed version of the
   page (from step 1 or 2) is sent to a mini model for structured JSON.
4. **OpenAI web search** (if configured) — if the shop blocked us entirely,
   the model looks the product page up itself.

Every lookup returns a **trace** (visible in the browser console and in the
per-card Activity view) and writes a line to the PocketBase admin log, so
you can see which step produced — or failed to produce — each field.

Configure via environment variables (Dokploy → service → *Environment*):

| Variable          | Default                     | Purpose                          |
| ----------------- | --------------------------- | -------------------------------- |
| `OPENAI_API_KEY`  | *(unset — AI disabled)*     | enables the AI fallback          |
| `OPENAI_MODEL`    | `gpt-5-mini`                | any model with JSON output       |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | any OpenAI-compatible API        |
| `JINA_API_KEY`    | *(unset)*                   | enables Jina Reader (auth'd)     |
| `JINA_ENABLED`    | *(unset)*                   | `true` for keyless Jina Reader   |

Costs are minimal: calls happen only when classic extraction comes up
short, inputs are condensed, and a mini-tier model is the default. Any
OpenAI-compatible endpoint works for the HTML-extraction path (step 2);
the web-search path (step 3) requires the OpenAI Responses API.

## Backups

The whole app's state is the `/pb/pb_data` volume: the SQLite database **and**
every uploaded product image. Back it up off-site — a backup that only lives
on the same server disappears with the server.

### Scheduled backups (recommended)

Set these in Dokploy → service → *Environment*, then redeploy:

```
BACKUP_CRON=0 3 * * *        # nightly at 03:00
BACKUP_MAX_KEEP=7            # keep the last 7 on disk
```

That alone gives you nightly snapshots, but they sit on the same disk. To push
them off the server, add any S3-compatible storage (Cloudflare R2 and
Backblaze B2 both have free tiers that comfortably fit this app):

```
BACKUP_S3_ENABLED=true
BACKUP_S3_BUCKET=shopping-board-backups
BACKUP_S3_REGION=auto                                  # "auto" for R2
BACKUP_S3_ENDPOINT=<account-id>.r2.cloudflarestorage.com
BACKUP_S3_ACCESS_KEY=...
BACKUP_S3_SECRET=...
```

These are applied on every boot by `pb/pb_hooks/backup.pb.js`. That matters:
backup settings normally live inside the database, so a destroyed volume would
come back with backups silently switched off. Driving them from environment
variables means a rebuilt server starts protecting itself again immediately.

You can also trigger and download backups by hand in the admin dashboard at
`https://your-domain/_/` → *Settings* → *Backups*.

### A second copy on your own machine

`scripts/pb-backup.sh` creates a fresh backup and downloads it locally:

```sh
PB_URL=https://board.example.com \
PB_EMAIL=you@example.com \
PB_PASSWORD='superuser-password' \
./scripts/pb-backup.sh ~/shopping-board-backups
```

It keeps the newest 14 local copies (`KEEP=n` to change). Run it from a laptop
cron job or another machine for a copy that is independent of both the server
and the S3 account.

### Restoring

A backup is a plain zip of `pb_data` (`data.db`, `auxiliary.db`, `storage/`).

- **Server still alive:** admin dashboard → *Settings* → *Backups* → upload the
  zip if needed, then use its restore action. PocketBase swaps the data in and
  restarts itself.
- **Server gone (rebuilt from scratch):** deploy the app so the empty
  `pb_data` volume exists, stop the service, unzip the backup into that volume
  so `data.db` sits at `/pb/pb_data/data.db`, then start it again:

  ```sh
  # on the Dokploy host, with the service stopped
  cd /etc/dokploy/compose/<project>/files/pb_data
  unzip -o ~/pb_backup_*.zip
  ```

  Accounts, boards, items, the audit trail and all uploaded images come back
  exactly as they were, including the admin login.

## Notes

- The metadata fetcher (`/api/og-preview`) and image proxy (`/api/img`)
  require a signed-in user and refuse private/internal hosts.
- If a shop blocks scraping and no AI key is set, the card can still be
  filled in manually or with an uploaded/pasted picture.
- To enable password-reset emails, configure SMTP in the PocketBase admin
  dashboard (*Settings → Mail settings*).
