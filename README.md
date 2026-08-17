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
bot protection (Lidl, Amazon, …). Setting an OpenAI API key enables a
smart fallback in `/api/og-preview`:

1. Plain OG/JSON-LD extraction runs first — if it finds title, image and
   price, **no AI call is made** (fast and free).
2. If the page was fetched but fields are missing, a condensed version of
   the HTML is sent to the model for structured extraction.
3. If the shop blocked the server entirely, the model is asked to look up
   the product page itself using OpenAI's **web search** tool.

Configure via environment variables (Dokploy → service → *Environment*):

| Variable          | Default                     | Purpose                       |
| ----------------- | --------------------------- | ----------------------------- |
| `OPENAI_API_KEY`  | *(unset — AI disabled)*     | enables the fallback          |
| `OPENAI_MODEL`    | `gpt-5-mini`                | any model with JSON output    |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | any OpenAI-compatible API     |

Costs are minimal: calls happen only when classic extraction comes up
short, inputs are condensed, and a mini-tier model is the default. Any
OpenAI-compatible endpoint works for the HTML-extraction path (step 2);
the web-search path (step 3) requires the OpenAI Responses API.

## Notes

- The metadata fetcher (`/api/og-preview`) and image proxy (`/api/img`)
  require a signed-in user and refuse private/internal hosts.
- If a shop blocks scraping and no AI key is set, the card can still be
  filled in manually or with an uploaded/pasted picture.
- To enable password-reset emails, configure SMTP in the PocketBase admin
  dashboard (*Settings → Mail settings*).
