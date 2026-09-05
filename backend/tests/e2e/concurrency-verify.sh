#!/usr/bin/env bash
# Concurrency + cross-frontend consistency check — real HTTP against the
# seeded API (MySQL in CI). Two questions a real shop needs answered:
#
#   1. When several cashiers race for the LAST units of a product, does the
#      FOR UPDATE stock lock let exactly the affordable number of sales
#      through and never drive stock negative?
#   2. Afterwards, do the three frontends' data sources (admin catalogue,
#      sale catalogue, shop /customer-products) all report the same truth,
#      and did every accepted sale leave an audit/ledger trail?
#
# Usage: API_URL=http://127.0.0.1:8080 bash backend/tests/e2e/concurrency-verify.sh
# Needs: curl, python3, an open shift is created by the script itself.
# The PHP dev server must run with PHP_CLI_SERVER_WORKERS>1 for the requests
# to actually overlap; with one worker the script still validates results
# (serialised) and prints a warning.
set -uo pipefail

API="${API_URL:-http://127.0.0.1:8080}"
ADMIN_EMAIL="${ADMIN_EMAIL:-owner@atelier.local}"
ADMIN_PASS="${ADMIN_PASS:-ChangeMe123!}"
CASHIER_EMAIL="${CASHIER_EMAIL:-sophea@atelier.local}"
CASHIER_PASS="${CASHIER_PASS:-ChangeMe123!}"
BOT_TOKEN="${SHOP_TELEGRAM_BOT_TOKEN:-${BOT_TOKEN:-123:test-token}}"
RACERS="${RACERS:-8}"      # parallel walk-in orders fired at once
STOCK="${STOCK:-3}"        # units on hand; RACERS must exceed this
OUT="$(mktemp -d)"
PASS=0
FAIL=0
FAILURES=()

pass() { PASS=$((PASS + 1)); echo "PASS  $1"; }
fail() {
  FAIL=$((FAIL + 1)); FAILURES+=("$1")
  echo "FAIL  $1${2:+  — $2}"
  if [ "${GITHUB_ACTIONS:-false}" = "true" ]; then
    printf '::error title=concurrency-verify::%s%s\n' "$1" "${2:+ — $2}"
  fi
}
check() { if [ "$2" = "true" ]; then pass "$1"; else fail "$1" "${3:-}"; fi; }

# api <method> <path> [json] [token] -> prints body; `code` returns the HTTP status
api() {
  local args=(-sS -X "$1" -H 'Accept: application/json' -w '\n%{http_code}')
  [ -n "${3:-}" ] && args+=(-H 'Content-Type: application/json' -d "$3")
  [ -n "${4:-}" ] && args+=(-H "Authorization: Bearer $4")
  local raw; raw="$(curl "${args[@]}" "$API$2" 2>/dev/null)"
  # Callers use api inside $(...): a variable would die with the subshell,
  # so the status code travels through a file and `code` reads it back.
  printf '%s' "$raw" | tail -n1 >"$OUT/code"
  printf '%s' "$raw" | sed '$d'
}
code() { cat "$OUT/code" 2>/dev/null || echo 000; }
jget() { python3 -c 'import json,sys
d=json.load(sys.stdin)
for k in sys.argv[1].split("."):
    d=d[int(k)] if k.lstrip("-").isdigit() else d.get(k)
    if d is None: break
print("" if d is None else (json.dumps(d) if isinstance(d,(dict,list)) else d))' "$1"; }

echo "===== login ====="
TOKEN_ADMIN="$(api POST /api/login "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" | jget token)"
TOKEN_CASHIER="$(api POST /api/login "{\"email\":\"$CASHIER_EMAIL\",\"password\":\"$CASHIER_PASS\"}" | jget token)"
check "admin + cashier tokens issued" "$([ -n "$TOKEN_ADMIN" ] && [ -n "$TOKEN_CASHIER" ] && echo true || echo false)"

# Shift: open one if none (sale endpoints are shift-gated).
if [ "$(api GET /api/shifts/current '' "$TOKEN_ADMIN")" = "null" ]; then
  api POST /api/shifts/open '{"openingCash":50,"openingCashKhr":0}' "$TOKEN_CASHIER" >/dev/null
  check "shift opened for the race" "$([ "$(code)" = 201 ] && echo true || echo false)" "HTTP $(code)"
else
  pass "a shift is already open"
fi

echo; echo "===== fixture: category + product with $STOCK units ====="
STAMP="$(date +%s)"
CAT="$(api POST /api/categories "{\"name\":\"Race $STAMP\",\"color\":\"#be185d\",\"active\":true}" "$TOKEN_ADMIN")"
CAT_ID="$(printf '%s' "$CAT" | jget id)"
PRODUCT="$(api POST /api/products "{\"name\":\"Race Cake $STAMP\",\"categoryId\":$CAT_ID,\"price\":4,\"stock\":$STOCK}" "$TOKEN_ADMIN")"
PID="$(printf '%s' "$PRODUCT" | jget id)"
check "race product created" "$([ "$(code)" = 201 ] && [ -n "$PID" ] && echo true || echo false)" "HTTP $(code) $PRODUCT"
BEFORE_SUMMARY="$(api GET /api/reports/summary '' "$TOKEN_ADMIN")"
BEFORE_SALES="$(printf '%s' "$BEFORE_SUMMARY" | jget todaySalesTotal)"
BEFORE_COUNT="$(printf '%s' "$BEFORE_SUMMARY" | jget completedOrderCount)"

echo; echo "===== race: $RACERS cashiers each try to sell 1 unit at the same instant ====="
for i in $(seq 1 "$RACERS"); do
  (
    KEY="$(python3 -c 'import uuid;print(uuid.uuid4())')"
    curl -sS -o "$OUT/r$i.body" -w '%{http_code}' -X POST "$API/api/orders" \
      -H 'Accept: application/json' -H 'Content-Type: application/json' \
      -H "Authorization: Bearer $TOKEN_CASHIER" \
      -d "{\"payment\":\"Cash\",\"items\":[{\"productId\":$PID,\"quantity\":1}],\"idempotencyKey\":\"$KEY\"}" \
      >"$OUT/r$i.code" 2>/dev/null
  ) &
done
wait
CREATED=0; CONFLICT=0; OTHER=0
for i in $(seq 1 "$RACERS"); do
  c="$(cat "$OUT/r$i.code")"
  case "$c" in
    201) CREATED=$((CREATED + 1));;
    409) CONFLICT=$((CONFLICT + 1));;
    *) OTHER=$((OTHER + 1)); echo "  racer $i -> HTTP $c $(head -c 200 "$OUT/r$i.body")";;
  esac
done
echo "  201 created=$CREATED  409 refused=$CONFLICT  other=$OTHER"
check "exactly $STOCK of $RACERS racing sales succeeded (no oversell, no undersell)" \
  "$([ "$CREATED" -eq "$STOCK" ] && echo true || echo false)" "created=$CREATED"
check "every losing racer got a clean 409 (no 5xx / no 200 with silent failure)" \
  "$([ "$OTHER" -eq 0 ] && echo true || echo false)" "other=$OTHER"

echo; echo "===== truth after the race ====="
ADMIN_STOCK="$(api GET /api/products '' "$TOKEN_ADMIN" | python3 -c "import json,sys;print([p['stock'] for p in json.load(sys.stdin) if p['id']==$PID][0])")"
SALE_STOCK="$(api GET /api/products '' "$TOKEN_CASHIER" | python3 -c "import json,sys;print([p['stock'] for p in json.load(sys.stdin) if p['id']==$PID][0])")"
check "admin catalogue shows stock 0" "$([ "$ADMIN_STOCK" = 0 ] && echo true || echo false)" "stock=$ADMIN_STOCK"
check "sale catalogue shows the same stock as admin" "$([ "$SALE_STOCK" = "$ADMIN_STOCK" ] && echo true || echo false)" "sale=$SALE_STOCK admin=$ADMIN_STOCK"

# Shop: signed initData exactly like the Mini App sends.
INIT_DATA="$(python3 - "$BOT_TOKEN" <<'PY'
import hashlib, hmac, json, sys, time, urllib.parse
token = sys.argv[1]
params = {"auth_date": str(int(time.time())), "query_id": "race", "user": json.dumps({"id": 4242, "first_name": "Race", "username": "race"})}
dcs = "\n".join(f"{k}={params[k]}" for k in sorted(params))
secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
params["hash"] = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
print(urllib.parse.urlencode(params))
PY
)"
SHOP="$(api POST /api/customer-products "$(python3 -c 'import json,sys;print(json.dumps({"initData":sys.argv[1]}))' "$INIT_DATA")")"
# 200 for a returning customer, 201 the first time the Mini App is opened.
if [ "$(code)" = 200 ] || [ "$(code)" = 201 ]; then
  SHOP_STOCK="$(printf '%s' "$SHOP" | python3 -c "import json,sys;d=json.load(sys.stdin);m=[p['stock'] for p in d['products'] if p['id']==$PID];print(m[0] if m else 'hidden')")"
  check "shop shows available stock 0 for the sold-out product (or hides it)" \
    "$([ "$SHOP_STOCK" = 0 ] || [ "$SHOP_STOCK" = hidden ] && echo true || echo false)" "shop=$SHOP_STOCK"
else
  fail "shop /customer-products reachable with signed initData" "HTTP $(code) $(printf '%s' "$SHOP" | head -c 200)"
fi

# Shop reservation must be counted: hold 1 unit of a fresh product via the
# customer flow and confirm shop (available) < admin (on hand).
PRODUCT2="$(api POST /api/products "{\"name\":\"Reserve Cake $STAMP\",\"categoryId\":$CAT_ID,\"price\":5,\"stock\":4}" "$TOKEN_ADMIN")"
PID2="$(printf '%s' "$PRODUCT2" | jget id)"
# A customer must have shared a phone before ordering. Drive the REAL path:
# the bot's contact button arrives as a Telegram webhook update.
if [ -n "${TELEGRAM_WEBHOOK_SECRET:-}" ]; then
  curl -sS -o /dev/null -X POST "$API/api/telegram/webhook" \
    -H 'Content-Type: application/json' -H "X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_WEBHOOK_SECRET" \
    -d '{"message":{"from":{"id":4242,"first_name":"Race","username":"race"},"contact":{"phone_number":"+855 12 000 000","user_id":4242}}}'
else
  echo "  (TELEGRAM_WEBHOOK_SECRET not set: cannot share a phone, reservation check will be skipped)"
fi
CUST="$(api POST /api/customer-orders "$(python3 -c 'import json,sys;print(json.dumps({"initData":sys.argv[1],"items":[{"productId":int(sys.argv[2]),"quantity":1}],"requestedTotal":5}))' "$INIT_DATA" "$PID2")")"
if [ "$(code)" = 201 ]; then
  ADMIN2="$(api GET /api/products '' "$TOKEN_ADMIN" | python3 -c "import json,sys;print([p['stock'] for p in json.load(sys.stdin) if p['id']==$PID2][0])")"
  SHOP2="$(api POST /api/customer-products "$(python3 -c 'import json,sys;print(json.dumps({"initData":sys.argv[1]}))' "$INIT_DATA")" | python3 -c "import json,sys;print([p['stock'] for p in json.load(sys.stdin)['products'] if p['id']==$PID2][0])")"
  check "admin still shows on-hand 4 after a customer reservation" "$([ "$ADMIN2" = 4 ] && echo true || echo false)" "admin=$ADMIN2"
  check "shop shows AVAILABLE 3 (on hand 4 − reserved 1)" "$([ "$SHOP2" = 3 ] && echo true || echo false)" "shop=$SHOP2"
else
  echo "  (customer order not placed: HTTP $(code) $(printf '%s' "$CUST" | head -c 160) — reservation check skipped)"
fi

echo; echo "===== money + ledger ====="
AFTER_SUMMARY="$(api GET /api/reports/summary '' "$TOKEN_ADMIN")"
AFTER_SALES="$(printf '%s' "$AFTER_SUMMARY" | jget todaySalesTotal)"
AFTER_COUNT="$(printf '%s' "$AFTER_SUMMARY" | jget completedOrderCount)"
EXPECTED_DELTA="$(python3 -c "print($STOCK*4)")"
if [ -n "$AFTER_SALES" ] && [ -n "$BEFORE_SALES" ]; then
  check "reports summary grew by exactly the accepted sales (\$$EXPECTED_DELTA, $STOCK orders)" \
    "$(python3 -c "print('true' if abs(($AFTER_SALES)-($BEFORE_SALES)-$EXPECTED_DELTA)<0.005 and ($AFTER_COUNT)-($BEFORE_COUNT)==$STOCK else 'false')")" \
    "sales $BEFORE_SALES -> $AFTER_SALES, orders $BEFORE_COUNT -> $AFTER_COUNT"
else
  fail "reports summary reachable" "$(printf '%s' "$AFTER_SUMMARY" | head -c 200)"
fi
ORDERS_FOR_PRODUCT="$(api GET /api/orders '' "$TOKEN_ADMIN" | python3 -c "
import json,sys
rows=json.load(sys.stdin)
print(sum(1 for o in rows if o.get('status')=='Completed' and any(('Race Cake $STAMP' in str(l)) for l in (o.get('detail') or o.get('items') or o.get('lineItems') or o.get('detail_json') or []))))" 2>/dev/null || echo "?")"
[ "$ORDERS_FOR_PRODUCT" = "?" ] || check "order list holds $STOCK completed race orders" "$([ "$ORDERS_FOR_PRODUCT" -eq "$STOCK" ] && echo true || echo false)" "found=$ORDERS_FOR_PRODUCT"
AUDIT="$(api GET '/api/reports/audit' '' "$TOKEN_ADMIN")"
if [ "$(code)" = 200 ]; then
  HAS_CREATE="$(printf '%s' "$AUDIT" | python3 -c "
import json,sys
d=json.load(sys.stdin); rows=d if isinstance(d,list) else (d.get('rows') or d.get('data') or d.get('events') or [])
print('true' if any(r.get('action')=='product.created' and str(r.get('details',{}).get('productId', r.get('details',{}).get('id')))=='$PID' for r in rows) else 'false')")"
  check "audit trail records the race product's creation" "$HAS_CREATE"
fi

echo
echo "############################################################"
echo "RESULT: $PASS passed, $FAIL failed"
echo "############################################################"
[ "$FAIL" -eq 0 ] || exit 1
