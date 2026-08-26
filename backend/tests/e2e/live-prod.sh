#!/usr/bin/env bash
# Live production API probes.
#
# Non-destructive first: health, login, read-only endpoints, and a check of
# whether the latest fixes are actually deployed. Then the shift lifecycle the
# user asked to verify (open -> persist across relogin -> close -> error
# cases), always leaving production with NO open shift. No orders are created
# against production (data hygiene).
set -uo pipefail

WORKER="${WORKER_URL:-https://g-cake-api.system-app.workers.dev}"
VM="${VM_URL:-http://34.9.115.19:8080}"
OUT="$(mktemp -d)"
PASS=0
FAIL=0

note() { echo; echo "===== $* ====="; }
req() { # label base method path [json] [token]
  local label="$1" base="$2" method="$3" path="$4" body="${5:-}" token="${6:-}"
  local args=(-sS --max-time 30 -X "$method" -H 'Accept: application/json' -w '\n%{http_code}')
  if [ -n "$body" ]; then args+=(-H 'Content-Type: application/json' -d "$body"); fi
  if [ -n "$token" ]; then args+=(-H "Authorization: Bearer $token"); fi
  curl "${args[@]}" "$base$path" >"$OUT/last.out" 2>"$OUT/last.err"
  local code
  code="$(tail -n1 "$OUT/last.out" 2>/dev/null || echo 000)"
  head -n -1 "$OUT/last.out" >"$OUT/last.body" 2>/dev/null || true
  echo "  [$label] $method $base$path -> HTTP $code"
  if [ -s "$OUT/last.body" ]; then echo "  body: $(head -c 800 "$OUT/last.body")"; fi
  echo "$code" >"$OUT/last.code"
}
assert() {
  if [ "$2" = "true" ]; then PASS=$((PASS + 1)); echo "  PASS  $1";
  else FAIL=$((FAIL + 1)); echo "  FAIL  $1"; fi
}
expect_code() {
  local actual
  actual="$(cat "$OUT/last.code")"
  assert "$1 (expected $2, got $actual)" "$([ "$actual" = "$2" ] && echo true || echo false)"
}

echo "############################################################"
echo "# LIVE PRODUCTION PROBE — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "# Worker: $WORKER"
echo "# VM:     $VM"
echo "############################################################"

# ---------- 1. Reachability ----------
note "1. Reachability"
for base in "$WORKER" "$VM"; do
  req "healthz ($base)" "$base" GET /healthz
  expect_code "healthz returns 200 ($base)" 200
done

# ---------- 2. Login + deployed version markers ----------
note "2. Login (admin) and deployed-version markers"
req "admin login" "$WORKER" POST /api/login '{"email":"owner@atelier.local","password":"ChangeMe123!"}'
expect_code "admin login returns 200" 200
TOKEN_ADMIN="$(python3 - "$OUT/last.body" <<'PY'
import json,sys
try: print(json.load(open(sys.argv[1]))['token'])
except Exception: print("__MISSING__")
PY
)"
assert "admin token issued" "$([ -n "$TOKEN_ADMIN" ] && [ "$TOKEN_ADMIN" != "__MISSING__" ] && echo true || echo false)"

# Markers for the latest fixes (they only exist if this branch is deployed):
req "GET /api/reports/freshness (new endpoint)" "$WORKER" GET /api/reports/freshness "" "$TOKEN_ADMIN"
FRESHNESS_CODE="$(cat "$OUT/last.code")"
echo "  -> /api/reports/freshness HTTP $FRESHNESS_CODE ($([ "$FRESHNESS_CODE" = "200" ] && echo DEPLOYED || echo NOT-DEPLOYED))"

req "GET /api/settings/business-profile (new endpoint)" "$WORKER" GET /api/settings/business-profile "" "$TOKEN_ADMIN"
BP_CODE="$(cat "$OUT/last.code")"
echo "  -> /api/settings/business-profile HTTP $BP_CODE ($([ "$BP_CODE" = "200" ] && echo DEPLOYED || echo NOT-DEPLOYED))"

req "GET /api/reports/summary (field check)" "$WORKER" GET /api/reports/summary "" "$TOKEN_ADMIN"
expect_code "summary returns 200" 200
python3 - "$OUT/last.body" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
print("  summary keys:", sorted(d.keys()))
print("  has yesterdaySalesTotal (new):", 'yesterdaySalesTotal' in d)
print("  has itemsSold (new):", 'itemsSold' in d)
print("  has ordersData (new):", 'ordersData' in d)
print("  todaySalesTotal:", d.get('todaySalesTotal'))
PY

req "GET /api/shifts/current (state check)" "$WORKER" GET /api/shifts/current "" "$TOKEN_ADMIN"
CURRENT_BODY="$(cat "$OUT/last.body")"
echo "  current shift on prod: $CURRENT_BODY"
if [ "$CURRENT_BODY" != "null" ]; then
  echo "  !!! An open shift already exists on production — skipping open/close lifecycle to avoid disturbing it."
  echo "  !!! (Reported above; user can close it in the admin UI.)"
  # Still probe the remaining read-only endpoints.
else
  note "3. Shift lifecycle on production (with cleanup)"

  req "cashier login" "$WORKER" POST /api/login '{"email":"sophea@atelier.local","password":"ChangeMe123!"}'
  expect_code "cashier login returns 200" 200
  TOKEN_CASHIER="$(python3 - "$OUT/last.body" <<'PY'
import json,sys
try: print(json.load(open(sys.argv[1]))['token'])
except Exception: print("__MISSING__")
PY
)"
  CASHIER_NAME="$(python3 - "$OUT/last.body" <<'PY'
import json,sys
try: print(json.load(open(sys.argv[1]))['employee']['name'])
except Exception: print("?")
PY
)"
  echo "  cashier: $CASHIER_NAME"

  req "open shift" "$WORKER" POST /api/shifts/open '{"openingCash":100.00}' "$TOKEN_CASHIER"
  expect_code "open shift returns 201" 201
  SHIFT_ID="$(python3 - "$OUT/last.body" <<'PY'
import json,sys
try: print(json.load(open(sys.argv[1]))['id'])
except Exception: print("?")
PY
)"
  echo "  opened shift id: $SHIFT_ID"

  req "current shift (open)" "$WORKER" GET /api/shifts/current "" "$TOKEN_ADMIN"
  assert "current shift is Open" "$([ "$(python3 -c "import json,sys;print(json.load(open('$OUT/last.body'))['status'])" 2>/dev/null)" = "Open" ] && echo true || echo false)"

  req "cashier logout" "$WORKER" POST /api/logout '{}' "$TOKEN_CASHIER"
  expect_code "logout returns 200" 200

  req "cashier relogin" "$WORKER" POST /api/login '{"email":"sophea@atelier.local","password":"ChangeMe123!"}'
  expect_code "relogin returns 200" 200
  TOKEN_CASHIER2="$(python3 - "$OUT/last.body" <<'PY'
import json,sys
try: print(json.load(open(sys.argv[1]))['token'])
except Exception: print("__MISSING__")
PY
)"
  req "current shift with new token" "$WORKER" GET /api/shifts/current "" "$TOKEN_CASHIER2"
  assert "shift is STILL OPEN after relogin" "$([ "$(python3 -c "import json,sys;print(json.load(open('$OUT/last.body'))['status'])" 2>/dev/null)" = "Open" ] && echo true || echo false)"
  assert "same shift id persists" "$([ "$(python3 -c "import json,sys;print(json.load(open('$OUT/last.body'))['id'])" 2>/dev/null)" = "$SHIFT_ID" ] && echo true || echo false)"

  req "close shift (no sales yet => closing 100 = balanced)" "$WORKER" POST /api/shifts/close '{"closingCash":100.00}' "$TOKEN_CASHIER2"
  expect_code "close shift returns 200" 200
  echo "  close body: $(head -c 400 "$OUT/last.body")"

  req "current shift after close" "$WORKER" GET /api/shifts/current "" "$TOKEN_ADMIN"
  assert "no open shift after close" "$([ "$(cat "$OUT/last.body")" = "null" ] && echo true || echo false)"

  req "close an already-closed shift" "$WORKER" POST /api/shifts/close '{"closingCash":100.00}' "$TOKEN_CASHIER2"
  expect_code "double close rejected with 409" 409

  req "open shift (second attempt setup)" "$WORKER" POST /api/shifts/open '{"openingCash":50.00}' "$TOKEN_CASHIER2"
  expect_code "reopen returns 201" 201
  req "open a second shift while one is open" "$WORKER" POST /api/shifts/open '{"openingCash":50.00}' "$TOKEN_ADMIN"
  expect_code "second open rejected with 409" 409
  req "cleanup: close the open shift" "$WORKER" POST /api/shifts/close '{"closingCash":50.00}' "$TOKEN_ADMIN"
  expect_code "cleanup close returns 200" 200
fi

# ---------- 4. Read-only endpoint sweep on production ----------
note "4. Read-only endpoint sweep"
for ep in /api/products /api/categories /api/customers /api/orders /api/employees /api/shifts /api/settings/pos-rules /api/settings/receipt-template /api/reports/dashboard /api/reports/revenue-trend /api/reports/products /api/reports/categories /api/reports/payments /api/reports/cashiers /api/reports/peak-hours /api/reports/waste /api/reports/customers; do
  req "GET $ep" "$WORKER" GET "$ep" "" "$TOKEN_ADMIN"
  expect_code "GET $ep returns 200" 200
done

note "Admin logout"
req "logout" "$WORKER" POST /api/logout '{}' "$TOKEN_ADMIN"
expect_code "admin logout returns 200" 200

echo
echo "############################################################"
echo "LIVE PROD RESULT: $PASS passed, $FAIL failed"
echo "############################################################"
[ "$FAIL" -eq 0 ] || exit 1
