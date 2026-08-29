#!/usr/bin/env bash
# Backend API lifecycle smoke test — runs the exact sequences a human would
# click through the admin/sale apps, via real HTTP requests.
#
# Usage: API_URL=http://127.0.0.1:8080 bash backend/tests/e2e/smoke.sh
# (Requires a freshly migrated + seeded backend; seeder must have run so the
#  three employee accounts exist.)
set -uo pipefail

API="${API_URL:-http://127.0.0.1:8080}"
OUT="$(mktemp -d)"
PASS=0
FAIL=0
FIRST_BAD_REQUEST_NOTE=""
FAILURES=()

note() { echo; echo "===== $* ====="; }
step() { echo; echo "----- $* -----"; }

# Every helper takes `${N:-}` defaults and checks its own arity: with `set -u`
# a bare unbound expansion ABORTS the whole script mid-run, hiding every
# result collected so far. (Seen in CI as `smoke.sh: line 109: $1: unbound
# variable` — that one was a label containing "$100.00", which interpolates
# $1; the money labels are single-quoted now. A short-called helper would
# fail the same way.) A buggy call now degrades to a loud FAIL line and the
# run keeps going and reports everything.

# Surface failures as GitHub check-run annotations — the only output visible
# in the Actions UI / API without downloading job logs (the Azure log store is
# unreachable from the sandbox). No-op on local runs (GITHUB_ACTIONS unset).
annotate() { # level title message
  if [ "${GITHUB_ACTIONS:-false}" = "true" ]; then
    printf '::%s title=%s::%s\n' "$1" \
      "$(printf '%s' "$2" | sed -e 's/%/%25/g' -e 's/\r/%0D/g' -e 's/\n/%0A/g' -e 's/:/%3A/g' -e 's/,/%2C/g')" \
      "$(printf '%s' "$3" | sed -e 's/%/%25/g' -e 's/\r/%0D/g' -e 's/\n/%0A/g')"
  fi
}

# req <label> <method> <path> [json-body] [auth-token]
req() {
  if [ "$#" -lt 3 ]; then
    echo "  [req] TEST BUG: req() wants >= 3 args (label method path), got $#: $*"
    echo 000 >"$OUT/last.code"
    : >"$OUT/last.body"
    return 0
  fi
  local label="$1" method="$2" path="$3" body="${4:-}" token="${5:-}"
  local args=(-sS -X "$method" -H 'Accept: application/json' -w '\n%{http_code}')
  if [ -n "$body" ]; then args+=(-H 'Content-Type: application/json' -d "$body"); fi
  if [ -n "$token" ]; then args+=(-H "Authorization: Bearer $token"); fi
  curl "${args[@]}" "$API$path" >"$OUT/last.out" 2>"$OUT/last.err"
  local code
  code="$(tail -n1 "$OUT/last.out")"
  # strip status line
  head -n -1 "$OUT/last.out" >"$OUT/last.body"
  echo "  [$label] $method $path -> HTTP $code"
  if [ -s "$OUT/last.body" ]; then
    echo "  body: $(head -c 600 "$OUT/last.body")"
  fi
  # Surface the FIRST non-2xx response body as a check-run annotation so the
  # concrete validation/server error is visible without job logs.
  # 4xx that the suite expects (409 shift-gate, 422 validation) are not
  # "first bad". Only 5xx / unexpected 4xx should surface without logs.
  if [ "$code" -ge 500 ] 2>/dev/null && [ -z "${FIRST_BAD_REQUEST_NOTE:-}" ]; then
    FIRST_BAD_REQUEST_NOTE="[$label] $method $path -> HTTP $code: $(head -c 240 "$OUT/last.body" | tr '\n' ' ')"
    annotate error 'first-bad-request' "$FIRST_BAD_REQUEST_NOTE"
  fi
  echo "$code" >"$OUT/last.code"
}

assert() { # label condition
  local label="${1:-(unlabeled assertion)}" cond="${2:-}"
  if [ "$#" -lt 2 ]; then
    cond="false"
    label="$label — TEST BUG: assert() wants 2 args, got $#"
  fi
  if [ "$cond" = "true" ]; then PASS=$((PASS + 1)); echo "  PASS  $label";
  else
    FAIL=$((FAIL + 1)); echo "  FAIL  $label"
    FAILURES+=("$label")
  fi
}

jqget() { # file jsonpath -> prints value or NULL (__MISSING__ if short-called)
  python3 - "${1:-}" "${2:-}" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print("__INVALID_JSON__"); sys.exit(0)
cur = d
for part in sys.argv[2].split('.'):
    if isinstance(cur, dict) and part in cur:
        cur = cur[part]
    elif isinstance(cur, list) and part.lstrip('-').isdigit():
        idx = int(part)
        if -len(cur) <= idx < len(cur):
            cur = cur[idx]
        else:
            print("__MISSING__"); sys.exit(0)
    else:
        print("__MISSING__"); sys.exit(0)
if isinstance(cur, bool):
    # JSON booleans must round-trip to the literal 'true'/'false'; Python's
    # print(True) gives 'True', which broke every boolean assertion.
    print("true" if cur else "false")
else:
    print(cur)
PY
}

expect_code() { # label expected_code
  local actual
  actual="$(cat "$OUT/last.code" 2>/dev/null || echo 000)"
  if [ "$#" -lt 2 ]; then
    assert "${1:-(unlabeled expect_code)} — TEST BUG: expect_code() wants 2 args, got $# (HTTP $actual)" false
    return 0
  fi
  assert "$1 (expected $2, got $actual)" "$([ "$actual" = "$2" ] && echo true || echo false)"
}

# Compare money/numeric JSON values without depending on whether PHP encoded
# a whole dollar amount as 20 or 20.0 (both are the same amount).
norm_money() {
  python3 -c "import sys; print(f'{float(sys.argv[1]):.2f}')" "$1" 2>/dev/null \
    || echo "$1"
}
money_eq() { # actual expected -> true|false
  [ "$(norm_money "$1")" = "$(norm_money "$2")" ] && echo true || echo false
}

echo "############################################################"
echo "# LIVE BACKEND SMOKE TEST — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "# API: $API"
echo "############################################################"

# ---------- 1. healthz ----------
note "1. Health check"
req "healthz" GET /healthz
expect_code "GET /healthz returns 200" 200

# ---------- 2. Logins ----------
note "2. Logins"
req "admin login" POST /api/login '{"email":"owner@atelier.local","password":"ChangeMe123!"}'
expect_code "admin login returns 200" 200
TOKEN_ADMIN="$(jqget "$OUT/last.body" token)"
assert "admin token issued" "$([ -n "$TOKEN_ADMIN" ] && [ "$TOKEN_ADMIN" != "__MISSING__" ] && echo true || echo false)"

req "cashier login (sophea)" POST /api/login '{"email":"sophea@atelier.local","password":"ChangeMe123!"}'
expect_code "cashier login returns 200" 200
TOKEN_CASHIER="$(jqget "$OUT/last.body" token)"
assert "cashier token issued" "$([ -n "$TOKEN_CASHIER" ] && [ "$TOKEN_CASHIER" != "__MISSING__" ] && echo true || echo false)"
CASHIER_NAME="$(jqget "$OUT/last.body" employee.name)"
echo "  cashier name from API: $CASHIER_NAME"

# ---------- 3. Shift lifecycle ----------
note "3. Shift lifecycle (open -> persist across relogin -> close -> errors)"

step "3a. No open shift yet (fresh DB)"
req "current shift" GET /api/shifts/current "" "$TOKEN_ADMIN"
expect_code "GET /api/shifts/current returns 200" 200
assert "reports no open shift (null)" "$([ "$(cat "$OUT/last.body")" = "null" ] && echo true || echo false)"

step "3a-2. Sale endpoints are blocked while no shift is open"
req "order without shift" POST /api/orders '{"payment":"Cash","items":[{"productId":1,"quantity":1}],"idempotencyKey":"00000000-0000-4000-8000-000000000001"}' "$TOKEN_CASHIER"
expect_code "POST /api/orders without shift returns 409" 409
assert "refusal carries requires_open_shift flag" "$([ "$(jqget "$OUT/last.body" requires_open_shift)" = "true" ] && echo true || echo false)"
req "hold without shift" POST /api/orders/hold '{"items":[{"productId":1,"quantity":1}]}' "$TOKEN_CASHIER"
expect_code "POST /api/orders/hold without shift returns 409" 409

step '3b. Cashier opens a shift with $100.00 opening cash'
req "open shift" POST /api/shifts/open '{"openingCash":100.00}' "$TOKEN_CASHIER"
expect_code "POST /api/shifts/open returns 201" 201
SHIFT_ID="$(jqget "$OUT/last.body" id)"
assert "shift id returned" "$([ -n "$SHIFT_ID" ] && [ "$SHIFT_ID" != "__MISSING__" ] && echo true || echo false)"

step "3c. Current shift is now open"
req "current shift after open" GET /api/shifts/current "" "$TOKEN_ADMIN"
expect_code "GET /api/shifts/current returns 200" 200
assert "current shift status = Open" "$([ "$(jqget "$OUT/last.body" status)" = "Open" ] && echo true || echo false)"
assert "current shift opened by cashier" "$([ "$(jqget "$OUT/last.body" openedBy)" = "$CASHIER_NAME" ] && echo true || echo false)"
assert "current shift opening float = 100" "$([ "$(jqget "$OUT/last.body" openingCashUsdCents)" = "10000" ] && echo true || echo false)"

step "3d. Cashier logs out and logs back in — shift must STILL be open"
req "cashier logout" POST /api/logout '{}' "$TOKEN_CASHIER"
expect_code "logout returns 200" 200
req "cashier relogin" POST /api/login '{"email":"sophea@atelier.local","password":"ChangeMe123!"}'
expect_code "relogin returns 200" 200
TOKEN_CASHIER2="$(jqget "$OUT/last.body" token)"
req "current shift with NEW token" GET /api/shifts/current "" "$TOKEN_CASHIER2"
expect_code "GET /api/shifts/current returns 200" 200
assert "shift is STILL OPEN after re-login (regression)" "$([ "$(jqget "$OUT/last.body" status)" = "Open" ] && echo true || echo false)"
assert "same shift id persists" "$([ "$(jqget "$OUT/last.body" id)" = "$SHIFT_ID" ] && echo true || echo false)"
TOKEN_CASHIER="$TOKEN_CASHIER2"

# ---------- 4. Orders (real walk-in sale) ----------
note "4. Walk-in order (cash) and the reports it feeds"

step "4a. Create a category and a product"
req "create category" POST /api/categories '{"name":"Smoke Test Cakes","color":"#be185d","active":true}' "$TOKEN_ADMIN"
expect_code "create category returns 201" 201
req "create product" POST /api/products '{"name":"Smoke Test Cake","category":"Smoke Test Cakes","price":10.00,"stock":5}' "$TOKEN_ADMIN"
expect_code "create product returns 201" 201
PRODUCT_ID="$(jqget "$OUT/last.body" id)"
assert "product id returned" "$([ -n "$PRODUCT_ID" ] && [ "$PRODUCT_ID" != "__MISSING__" ] && echo true || echo false)"
assert "product stock = 5" "$([ "$(jqget "$OUT/last.body" stock)" = "5" ] && echo true || echo false)"

step '4b. Cashier sells 2 x $10.00 by cash (total $20.00)'
req "create order" POST /api/orders "{\"payment\":\"Cash\",\"items\":[{\"productId\":$PRODUCT_ID,\"quantity\":2}],\"idempotencyKey\":\"00000000-0000-4000-8000-000000000002\"}" "$TOKEN_CASHIER"
expect_code "create order returns 201" 201
ORDER_ID="$(jqget "$OUT/last.body" id)"
assert "order id returned" "$([ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "__MISSING__" ] && echo true || echo false)"
assert "order total = 20.0" "$(money_eq "$(jqget "$OUT/last.body" total)" "20.0")"
assert "order status = Completed" "$([ "$(jqget "$OUT/last.body" status)" = "Completed" ] && echo true || echo false)"
assert "order paymentStatus = paid" "$([ "$(jqget "$OUT/last.body" paymentStatus)" = "paid" ] && echo true || echo false)"

step "4c. Same idempotency key does not create a second order"
req "duplicate order (same key)" POST /api/orders "{\"payment\":\"Cash\",\"items\":[{\"productId\":$PRODUCT_ID,\"quantity\":2}],\"idempotencyKey\":\"00000000-0000-4000-8000-000000000002\"}" "$TOKEN_CASHIER"
expect_code "duplicate returns 200 (idempotent)" 200
assert "duplicate returns the SAME order id" "$([ "$(jqget "$OUT/last.body" id)" = "$ORDER_ID" ] && echo true || echo false)"
req "product after 2x order" GET /api/products "" "$TOKEN_ADMIN"
assert "product stock = 3 after one sale of 2" "$([ "$(jqget "$OUT/last.body" 0.stock)" = "3" ] && echo true || echo false)"

step "4d. Reports summary reflects the REAL sale"
req "reports summary" GET /api/reports/summary "" "$TOKEN_ADMIN"
expect_code "GET /api/reports/summary returns 200" 200
assert "todaySalesTotal = 20.0" "$(money_eq "$(jqget "$OUT/last.body" todaySalesTotal)" "20.0")"
assert "todayOrdersCount = 1" "$([ "$(jqget "$OUT/last.body" todayOrdersCount)" = "1" ] && echo true || echo false)"
assert "itemsSold = 2" "$([ "$(jqget "$OUT/last.body" itemsSold)" = "2" ] && echo true || echo false)"
assert "qrPaymentCount = 0" "$([ "$(jqget "$OUT/last.body" qrPaymentCount)" = "0" ] && echo true || echo false)"
assert "yesterdaySalesTotal = 0.0" "$(money_eq "$(jqget "$OUT/last.body" yesterdaySalesTotal)" "0.0")"
LAST_DAY="$(jqget "$OUT/last.body" ordersData.-1.day)"
LAST_VAL="$(jqget "$OUT/last.body" ordersData.-1.value)"
TODAY="$(TZ=Asia/Phnom_Penh date +%F)"
assert "ordersData last day = today ($TODAY)" "$([ "$LAST_DAY" = "$TODAY" ] && echo true || echo false)"
assert "ordersData last day value = 1" "$([ "$LAST_VAL" = "1" ] && echo true || echo false)"
REV_LAST="$(jqget "$OUT/last.body" revenueData.-1.value)"
assert "revenueData last day = 20.0" "$(money_eq "$REV_LAST" "20.0")"

step "4e. Reports trend / dashboard / products / payments endpoints"
req "revenue trend" GET /api/reports/revenue-trend "" "$TOKEN_ADMIN"
expect_code "GET /api/reports/revenue-trend returns 200" 200
req "reports dashboard" GET /api/reports/dashboard "" "$TOKEN_ADMIN"
expect_code "GET /api/reports/dashboard returns 200" 200
req "reports products" GET /api/reports/products "" "$TOKEN_ADMIN"
expect_code "GET /api/reports/products returns 200" 200
req "reports payments" GET /api/reports/payments "" "$TOKEN_ADMIN"
expect_code "GET /api/reports/payments returns 200" 200
req "reports categories" GET /api/reports/categories "" "$TOKEN_ADMIN"
expect_code "GET /api/reports/categories returns 200" 200
req "reports peak-hours" GET /api/reports/peak-hours "" "$TOKEN_ADMIN"
expect_code "GET /api/reports/peak-hours returns 200" 200
# Regression: this endpoint 500'd in production with SQLSTATE 1052
# (ambiguous created_at across the orders/employees join).
req "reports cashiers" GET /api/reports/cashiers "" "$TOKEN_ADMIN"
expect_code "GET /api/reports/cashiers returns 200" 200
assert "cashiers report attributes the sale" "$([ "$(jqget "$OUT/last.body" 0.completedOrderCount)" = "1" ] && echo true || echo false)"
assert "cashiers report exposes accountability fields" "$([ "$(jqget "$OUT/last.body" 0.discountCount)" = "0" ] && echo true || echo false)"
assert "cashiers report exposes repeatedShortfall" "$([ "$(jqget "$OUT/last.body" 0.repeatedShortfall)" = "False" ] || [ "$(jqget "$OUT/last.body" 0.repeatedShortfall)" = "false" ] && echo true || echo false)"
req "reports retention" GET /api/reports/retention "" "$TOKEN_ADMIN"
expect_code "GET /api/reports/retention returns 200" 200
assert "retention counts the walk-in customer-less sale as 0 customers" "$([ "$(jqget "$OUT/last.body" customersWithOrders)" = "0" ] && echo true || echo false)"

# ---------- 5. Close shift ----------
note "5. Close the shift"
step "5a. Expected drawer = 100 opening + 20 cash sales; close with 120 => zero variance"
req "close shift" POST /api/shifts/close '{"closingCash":120.00}' "$TOKEN_CASHIER"
expect_code "POST /api/shifts/close returns 200" 200
annotate notice 'close-response' "$(head -c 400 "$OUT/last.body" | tr '\n' ' ')"
assert "close returns variance 0" "$(money_eq "$(jqget "$OUT/last.body" variance)" "0")"
assert "close returns cashSales 20" "$(money_eq "$(jqget "$OUT/last.body" cashSales)" "20")"
assert "shift status = Closed" "$([ "$(jqget "$OUT/last.body" status)" = "Closed" ] && echo true || echo false)"

step "5b. Current shift now reports none"
req "current shift after close" GET /api/shifts/current "" "$TOKEN_ADMIN"
expect_code "GET /api/shifts/current returns 200" 200
assert "no open shift after close (null)" "$([ "$(cat "$OUT/last.body")" = "null" ] && echo true || echo false)"

step "5b-2. Audit trail recorded who did what"
req "audit trail" GET /api/reports/audit "" "$TOKEN_ADMIN"
expect_code "GET /api/reports/audit returns 200" 200
assert "audit trail has shift.opened" "$(grep -q '"shift.opened"' "$OUT/last.body" && echo true || echo false)"
assert "audit trail has order.completed" "$(grep -q '"order.completed"' "$OUT/last.body" && echo true || echo false)"
assert "audit trail has shift.closed" "$(grep -q '"shift.closed"' "$OUT/last.body" && echo true || echo false)"
assert "audit trail names the cashier" "$(grep -q "$CASHIER_NAME" "$OUT/last.body" && echo true || echo false)"
req "cashiers pending panel" GET /api/orders/pending "" "$TOKEN_ADMIN"
expect_code "GET /api/orders/pending returns 200" 200

step "5c. Closing again is rejected cleanly"
req "close already-closed shift" POST /api/shifts/close '{"closingCash":120.00}' "$TOKEN_CASHIER"
expect_code "second close returns 409" 409

step "5d. Opening a second shift while one is open is rejected"
req "open shift #2" POST /api/shifts/open '{"openingCash":50.00}' "$TOKEN_CASHIER"
expect_code "first open of new shift returns 201" 201
req "open shift #3 while #2 open" POST /api/shifts/open '{"openingCash":50.00}' "$TOKEN_ADMIN"
expect_code "second open while open returns 409" 409
req "cleanup: close shift #2" POST /api/shifts/close '{"closingCash":50.00}' "$TOKEN_ADMIN"
expect_code "cleanup close returns 200" 200

step "5e. With every shift closed, sale endpoints are blocked again"
req "order after close" POST /api/orders '{"payment":"Cash","items":[{"productId":1,"quantity":1}],"idempotencyKey":"00000000-0000-4000-8000-000000000003"}' "$TOKEN_CASHIER"
expect_code "POST /api/orders after close returns 409" 409
assert "refusal carries requires_open_shift flag" "$([ "$(jqget "$OUT/last.body" requires_open_shift)" = "true" ] && echo true || echo false)"

# ---------- 6. Freshness & waste ----------
note "6. Freshness & waste (real inventory math)"
step "6a. Freshness report after the sale: stock 3, all fresh, no waste"
req "freshness report" GET /api/reports/freshness "" "$TOKEN_ADMIN"
expect_code "GET /api/reports/freshness returns 200" 200
assert "totalUnits = 3" "$([ "$(jqget "$OUT/last.body" totalUnits)" = "3" ] && echo true || echo false)"
assert "freshUnits = 3" "$([ "$(jqget "$OUT/last.body" freshUnits)" = "3" ] && echo true || echo false)"
assert "freshPercent = 100" "$([ "$(jqget "$OUT/last.body" freshPercent)" = "100" ] && echo true || echo false)"
assert "expiresTodayUnits = 0" "$([ "$(jqget "$OUT/last.body" expiresTodayUnits)" = "0" ] && echo true || echo false)"
assert "wasteThisWeekCents = 0" "$([ "$(jqget "$OUT/last.body" wasteThisWeekCents)" = "0" ] && echo true || echo false)"
assert "events empty" "$([ "$(jqget "$OUT/last.body" events.0)" = "__MISSING__" ] && echo true || echo false)"

step '6b. Record 1 unit of waste (damaged) — stock 3 -> 2, waste $10.00'
req "record waste" POST /api/inventory/waste "{\"productId\":$PRODUCT_ID,\"quantity\":1,\"reason\":\"damaged\",\"note\":\"smoke test\"}" "$TOKEN_ADMIN"
expect_code "POST /api/inventory/waste returns 201" 201
assert "waste response remainingStock = 2" "$([ "$(jqget "$OUT/last.body" remainingStock)" = "2" ] && echo true || echo false)"
req "freshness after waste" GET /api/reports/freshness "" "$TOKEN_ADMIN"
assert "totalUnits = 2 after waste" "$([ "$(jqget "$OUT/last.body" totalUnits)" = "2" ] && echo true || echo false)"
assert "wasteThisWeekCents = 1000" "$([ "$(jqget "$OUT/last.body" wasteThisWeekCents)" = "1000" ] && echo true || echo false)"
assert "events has 1 row" "$([ "$(jqget "$OUT/last.body" events.0.productName)" = "Smoke Test Cake" ] && echo true || echo false)"
assert "event retailValue = 10.0" "$(money_eq "$(jqget "$OUT/last.body" events.0.retailValue)" "10.0")"
req "waste more than on hand" POST /api/inventory/waste "{\"productId\":$PRODUCT_ID,\"quantity\":99,\"reason\":\"expired\"}" "$TOKEN_ADMIN"
expect_code "over-write rejected with 422" 422
req "product stock after waste" GET /api/products "" "$TOKEN_ADMIN"
assert "product stock = 2" "$([ "$(jqget "$OUT/last.body" 0.stock)" = "2" ] && echo true || echo false)"

# ---------- 7. Settings ----------
note "7. Settings endpoints"
step "7a. Business profile round-trip"
req "get business profile" GET /api/settings/business-profile "" "$TOKEN_ADMIN"
expect_code "GET /api/settings/business-profile returns 200" 200
req "update business profile" PUT /api/settings/business-profile '{"businessName":"G-Cake Test","locationName":"BKK1","address":"Street 63","phone":"+855","timezone":"Asia/Phnom_Penh","primaryCurrency":"USD","secondaryCurrency":"KHR"}' "$TOKEN_ADMIN"
expect_code "PUT business profile returns 200" 200
req "get business profile after update" GET /api/settings/business-profile "" "$TOKEN_ADMIN"
assert "businessName persisted" "$([ "$(jqget "$OUT/last.body" businessName)" = "G-Cake Test" ] && echo true || echo false)"
req "cashier tries to update profile" PUT /api/settings/business-profile '{"businessName":"Hijacked","timezone":"Asia/Phnom_Penh","primaryCurrency":"USD","secondaryCurrency":"none"}' "$TOKEN_CASHIER"
expect_code "cashier PUT forbidden (403)" 403

step "7b. Pos rules include shelf-life defaults"
req "get pos rules" GET /api/settings/pos-rules "" "$TOKEN_ADMIN"
expect_code "GET /api/settings/pos-rules returns 200" 200
assert "defaultShelfLifeDays = 3" "$([ "$(jqget "$OUT/last.body" defaultShelfLifeDays)" = "3" ] && echo true || echo false)"

step "7c. Receipt template round-trip"
req "get receipt template" GET /api/settings/receipt-template "" "$TOKEN_ADMIN"
expect_code "GET receipt template returns 200" 200
req "update receipt template" PUT /api/settings/receipt-template '{"paperSize":"80mm","language":"km","businessName":"G-Cake","address":"Phnom Penh","logoUrl":"","footerMessage":"Thank you"}' "$TOKEN_ADMIN"
expect_code "PUT receipt template returns 200" 200
req "receipt for the order" GET "/api/receipts/$ORDER_ID" "" "$TOKEN_ADMIN"
expect_code "GET receipt returns 200" 200

# ---------- 8. Customers / misc ----------
note "8. Customers and remaining endpoints"
req "customers list" GET /api/customers "" "$TOKEN_ADMIN"
expect_code "GET /api/customers returns 200" 200
assert "customers empty (walk-in sale has no customer)" "$([ "$(jqget "$OUT/last.body" 0)" = "__MISSING__" ] && echo true || echo false)"
req "orders list" GET /api/orders "" "$TOKEN_ADMIN"
expect_code "GET /api/orders returns 200" 200
assert "orders list contains smoke order" "$([ "$(jqget "$OUT/last.body" 0.id)" = "$ORDER_ID" ] && echo true || echo false)"
req "employees list" GET /api/employees "" "$TOKEN_ADMIN"
expect_code "GET /api/employees returns 200" 200
req "shifts history" GET /api/shifts "" "$TOKEN_ADMIN"
expect_code "GET /api/shifts returns 200" 200
assert "shift history has 2 closed shifts" "$([ "$(jqget "$OUT/last.body" 1.status)" = "Closed" ] && echo true || echo false)"

# ---------- 9. Product hard delete rules ----------
note "9. Product delete (hard delete only when unreferenced)"
step "9a. Sold product (has order_items) is refused with an explanation"
req "delete sold product" DELETE "/api/products/$PRODUCT_ID" "" "$TOKEN_ADMIN"
expect_code "DELETE referenced product returns 422" 422
assert "refusal says referenced_by_orders" "$([ "$(jqget "$OUT/last.body" referenced_by_orders)" = "true" ] && echo true || echo false)"
req "sold product still exists" GET /api/products "" "$TOKEN_ADMIN"
assert "referenced product NOT deleted" "$(python3 - "$OUT/last.body" "$PRODUCT_ID" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print("true" if any(p["id"] == int(sys.argv[2]) for p in d) else "false")
PY
)"

step "9b. Never-sold product is hard deleted"
req "create throwaway product" POST /api/products '{"name":"Throwaway Cake","category":"Smoke Test Cakes","price":1.00,"stock":1}' "$TOKEN_ADMIN"
expect_code "create throwaway returns 201" 201
THROWAWAY_ID="$(jqget "$OUT/last.body" id)"
req "delete throwaway product" DELETE "/api/products/$THROWAWAY_ID" "" "$TOKEN_ADMIN"
expect_code "DELETE unreferenced product returns 200" 200
assert "response confirms deletion" "$([ "$(jqget "$OUT/last.body" deleted)" = "true" ] && echo true || echo false)"
req "catalog after delete" GET /api/products "" "$TOKEN_ADMIN"
assert "throwaway product is gone" "$(python3 - "$OUT/last.body" "$THROWAWAY_ID" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print("true" if not any(p["id"] == int(sys.argv[2]) for p in d) else "false")
PY
)"

note "10. Admin logout"
req "admin logout" POST /api/logout '{}' "$TOKEN_ADMIN"
expect_code "admin logout returns 200" 200

echo
echo "############################################################"
echo "RESULT: $PASS passed, $FAIL failed"
echo "############################################################"
if [ "$FAIL" -ne 0 ]; then
  # One collated annotation (GitHub caps at 10 per step, so per-assertion
  # annotations were dropping the earliest failures).
  annotate error 'smoke-suite-failures' \
    "failed: $(IFS=' | '; echo "${FAILURES[*]}")"
fi
[ "$FAIL" -eq 0 ] || exit 1
