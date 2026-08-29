#!/usr/bin/env bash
#
# REAL end-to-end verification that a completed sale actually dispatches and
# sends the staff Telegram message — through the real database queue, a real
# `php artisan queue:work` process, and a real HTTP POST to a local Telegram
# API stub (TELEGRAM_API_BASE). No Http::fake anywhere: the job goes from
# MySQL `jobs` table → worker process → network socket → stub server.
#
# Usage: API_URL=http://127.0.0.1:8080 bash backend/tests/e2e/queue-verify.sh
# Requires the backend .env to have:
#   QUEUE_CONNECTION=database
#   STAFF_TELEGRAM_BOT_TOKEN=123:staff-ci-token
#   STAFF_NOTIFICATION_CHAT_ID=424242
#   TELEGRAM_API_BASE=http://127.0.0.1:8090
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:8080}"
STUB_PORT="${STUB_PORT:-8090}"
STUB_LOG="${STUB_LOG:-/tmp/telegram-stub.log}"
BACKEND_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DB_COUNT() {
  mysql -h127.0.0.1 -uroot -proot -N -e "SELECT COUNT(*) FROM cake_pos.jobs;" 2>/dev/null || echo "?"
}

echo "== starting local Telegram API stub on :$STUB_PORT =="
rm -f "$STUB_LOG"
node - "$STUB_PORT" "$STUB_LOG" <<'NODE' &
const http = require('http')
const fs = require('fs')
const [port, log] = process.argv.slice(2)
http
  .createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      fs.appendFileSync(log, JSON.stringify({ url: req.url, body }) + '\n')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    })
  })
  .listen(Number(port), '127.0.0.1')
NODE
STUB_PID=$!
trap 'kill $STUB_PID 2>/dev/null || true' EXIT
sleep 1

echo "== login (admin) =="
TOKEN=$(curl -sS -X POST "$API_URL/api/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@atelier.local","password":"ChangeMe123!"}' |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
AUTH="Authorization: Bearer $TOKEN"

echo "== ensure an open shift (idempotent) =="
curl -sS -f -X POST "$API_URL/api/shifts/open" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"openingCash":100,"openingCashKhr":40000}' >/dev/null ||
  echo "   (shift already open — continuing)"

echo "== pick a product and pay it exactly in USD =="
read -r PRODUCT_ID PRICE_CENTS <<<"$(curl -sS "$API_URL/api/products" -H "$AUTH" |
  python3 -c 'import json,sys; p=json.load(sys.stdin)[0]; print(p["id"], round(p["price"]*100))')"

IDEMPOTENCY="$(python3 -c 'import uuid;print(uuid.uuid4())')"
ORDER=$(curl -sS -X POST "$API_URL/api/orders" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"payment\":\"Cash\",\"items\":[{\"productId\":$PRODUCT_ID,\"quantity\":1}],\"idempotencyKey\":\"$IDEMPOTENCY\",\"usdReceivedCents\":$PRICE_CENTS,\"khrReceived\":0,\"changeUsdCents\":0,\"changeKhr\":0,\"exchangeRateKhrPerUsd\":4100}")
ORDER_ID=$(echo "$ORDER" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
echo "   order completed: $ORDER_ID"

BEFORE=$(DB_COUNT)
echo "== jobs queued in MySQL right after the sale: $BEFORE =="
if [ "$BEFORE" = "0" ] || [ "$BEFORE" = "?" ]; then
  echo "FAIL — expected the notification job to be waiting in the database queue"
  exit 1
fi

echo "== run the REAL queue worker until the queue drains =="
( cd "$BACKEND_DIR" && php artisan queue:work database --stop-when-empty --tries=1 --sleep=0 )
AFTER=$(DB_COUNT)
echo "== jobs remaining after the worker: $AFTER =="
[ "$AFTER" = "0" ] || { echo "FAIL — worker did not drain the queue"; exit 1; }

echo "== assert the stub actually received the staff sendMessage =="
python3 - "$STUB_LOG" "$ORDER_ID" <<'PYTHON'
import json, sys
log, order_id = sys.argv[1], sys.argv[2]
sends = []
for line in open(log):
    entry = json.loads(line)
    if entry['url'].endswith('/sendMessage') and '/bot123:staff-ci-token/' in entry['url']:
        sends.append(json.loads(entry['body']))
matches = [
    s
    for s in sends
    if order_id in s.get('text', '') and str(s.get('chat_id')) == '424242'
]
if not matches:
    print('FAIL — no staff sendMessage containing the order id reached the Telegram API stub')
    print('stub captured:', json.dumps(sends, indent=2)[:2000])
    sys.exit(1)
print(
    f"PASS — staff notification SENT via real queue worker: chat={matches[0]['chat_id']} order={order_id}"
)
print('message head:', matches[0]['text'].splitlines()[0])
PYTHON
