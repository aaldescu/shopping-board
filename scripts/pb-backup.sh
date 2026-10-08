#!/usr/bin/env bash
# Pull a fresh Shopping Board backup to this machine.
#
# Creates a new server-side backup, then downloads it locally — an extra copy
# that lives nowhere near the server. Safe to run from a laptop, a NAS or a
# cron job on another box.
#
# Usage:
#   PB_URL=https://board.example.com \
#   PB_EMAIL=you@example.com \
#   PB_PASSWORD='superuser-password' \
#   ./scripts/pb-backup.sh [output-dir]
#
# Requires: bash, curl, python3

set -euo pipefail

PB_URL="${PB_URL:?set PB_URL, e.g. https://board.example.com}"
PB_EMAIL="${PB_EMAIL:?set PB_EMAIL (PocketBase superuser)}"
PB_PASSWORD="${PB_PASSWORD:?set PB_PASSWORD}"
OUT_DIR="${1:-./backups}"
KEEP="${KEEP:-14}"

PB_URL="${PB_URL%/}"
mkdir -p "$OUT_DIR"

jsonget() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

echo "→ authenticating as $PB_EMAIL"
TOKEN=$(curl -fsS -X POST "$PB_URL/api/collections/_superusers/auth-with-password" \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,os;print(json.dumps({"identity":os.environ["PB_EMAIL"],"password":os.environ["PB_PASSWORD"]}))')" \
  | jsonget '["token"]')

echo "→ creating a server-side backup"
curl -fsS -X POST "$PB_URL/api/backups" \
  -H "Authorization: $TOKEN" -H 'Content-Type: application/json' -d '{}' -o /dev/null

echo "→ finding the newest backup"
KEY=$(curl -fsS "$PB_URL/api/backups" -H "Authorization: $TOKEN" \
  | python3 -c 'import json,sys; b=json.load(sys.stdin); b.sort(key=lambda x: x["modified"], reverse=True); print(b[0]["key"])')

echo "→ downloading $KEY"
FILE_TOKEN=$(curl -fsS -X POST "$PB_URL/api/files/token" -H "Authorization: $TOKEN" | jsonget '["token"]')
curl -fsS "$PB_URL/api/backups/$KEY?token=$FILE_TOKEN" -o "$OUT_DIR/$KEY"

# Sanity check: a valid backup is a zip containing the SQLite database.
if ! unzip -l "$OUT_DIR/$KEY" 2>/dev/null | grep -q 'data\.db'; then
  echo "✗ downloaded file does not look like a PocketBase backup" >&2
  exit 1
fi

echo "✓ saved $OUT_DIR/$KEY ($(du -h "$OUT_DIR/$KEY" | cut -f1))"

# Keep only the most recent $KEEP local copies.
ls -1t "$OUT_DIR"/pb_backup_*.zip 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  echo "  removing old local copy: $(basename "$old")"
  rm -f "$old"
done
