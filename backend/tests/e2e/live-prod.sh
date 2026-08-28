#!/usr/bin/env bash
# Live production API probes.
#
# Non-destructive first: health, login, read-only endpoints, and a check of
# whether the latest fixes are actually deployed. Then — only when
# LIVE_PROD_SHIFT_LIFECYCLE=1 — the shift lifecycle the user asked to verify
# (open -> persist across relogin -> close -> error cases).
#
# PRODUCTION SAFETY (this script used to be able to strand a real shift OPEN
# on production — only one shift can be open store-wide, and the admin/sale
# apps read that server truth):
#
#   1. An EXIT trap closes WHATEVER SHIFT THIS SCRIPT OPENED, even if an
#      assertion fails, curl times out (Aiven free-tier wake-up) or the job
#      is cancelled. It closes with the shift's own expected float so the
#      variance is 0, then VERIFIES /api/shifts/current is null and screams
#      (non-zero exit) if it is not.
#   2. If production already has an open shift when the probe starts:
#        - stale CI leftover (opened by the CI cashier with the probe's own
#          round floats) -> closed and reported loudly, so the next run
#          heals the stuck state by itself;
#        - anything else (a real cashier's shift) -> NOT touched: the probe
#          skips the lifecycle and EXITS NON-ZERO so a human sees it.
#   3. The mutating lifecycle is opt-in (LIVE_PROD_SHIFT_LIFECYCLE), because
#      backend-e2e/ui already cover the same behaviour against an ephemeral
#      MySQL with zero production risk.
#
# No orders are ever created against production (data hygiene).
set -uo pipefail

WORKER="${WORKER_URL:-https://g-cake-api.system-app.workers.dev}"
VM="${VM_URL:-http://34.9.115.19:8080}"
ADMIN_EMAIL="${ADMIN_EMAIL:-owner@atelier.local}"
ADMIN_PASS="${ADMIN_PASS:-ChangeMe123!}"
CI_CASHIER_EMAIL="${CI_CASHIER_EMAIL:-sophea@atelier.local}"
CI_CASHIER_PASS="${CI_CASHIER_PASS:-ChangeMe123!}"
# Only the CI probe uses these exact round floats — that is how a stranded
# shift is recognised as "ours" and safe to close.
CI_FLOATS="100.00 50.00"
# Set to 1 to run the mutating open/close lifecycle (workflow_dispatch).
LIVE_PROD_SHIFT_LIFECYCLE="${LIVE_PROD_SHIFT_LIFECYCLE:-0}"
OUT="$(mktemp -d)"
PASS=0
FAIL=0

# Shift this script opened and must close before exiting (empty = nothing to
# clean up). Deliberately global so the EXIT trap can see it.
OPENED_SHIFT_ID=""
CLEANUP_FAILED=0
STUCK_SHIFT=0

note() { echo; echo "===== $* ====="; }
banner() { echo; echo "############################################################"; echo "# $*"; echo "############################################################"; }
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
# 100.0 and 100.00 are the same float — compare money numerically.
norm_money() {
  python3 -c "import sys;print(f'{float(sys.argv[1]):.2f}')" "$1" 2>/dev/null || echo "$1"
}
json_field() { # file field [default]
  python3 - "$1" "$2" "${3:-}" <<'PY'
import json,sys
try:
    with open(sys.argv[1]) as fh:
        value = json.load(fh)
except Exception:
    print(sys.argv[3]); raise SystemExit
if not isinstance(value, dict):
    print(sys.argv[3]); raise SystemExit
out = value.get(sys.argv[2], sys.argv[3])
print('' if out is None else out)
PY
}
login_token() { # email password -> token (empty when login failed)
  local email="$1" password="$2" body
  body="$(curl -sS --max-time 30 -X POST -H 'Accept: application/json' \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}" \
    "$WORKER/api/login" 2>/dev/null || true)"
  printf '%s' "$body" >"$OUT/login.body"
  json_field "$OUT/login.body" token ""
}

# Closes whatever shift is currently open, counting the shift's own expected
# float back so the variance is 0, retrying through transient failures, then
# VERIFIES production is left with no open shift. Returns 1 if it cannot.
close_current_shift() {
  local label="$1" token float khr attempt code
  token="$(login_token "$ADMIN_EMAIL" "$ADMIN_PASS")"
  if [ -z "$token" ]; then
    echo "  !! [$label] cannot log in to close the shift — production may be left OPEN"
    return 1
  fi
  req "read current shift ($label)" "$WORKER" GET /api/shifts/current "" "$token"
  float="$(python3 - "$OUT/last.body" <<'PY'
import json,sys
try:
    d = json.load(open(sys.argv[1]))
    print(f"{(d.get('expectedCashUsdCents') or 0) / 100:.2f}" if isinstance(d, dict) else "0.00")
except Exception:
    print("0.00")
PY
)"
  khr="$(json_field "$OUT/last.body" expectedCashKhr 0)"
  for attempt in 1 2 3 4 5; do
    req "close shift ($label, attempt $attempt, closing $float / ៛$khr)" \
      "$WORKER" POST /api/shifts/close \
      "{\"closingCash\":$float,\"closingCashKhr\":$khr}" "$token"
    code="$(cat "$OUT/last.code")"
    if [ "$code" = "200" ]; then break; fi
    sleep 5
  done
  req "verify no open shift ($label)" "$WORKER" GET /api/shifts/current "" "$token"
  if [ "$(cat "$OUT/last.body" | tr -d '[:space:]')" = "null" ]; then
    echo "  OK   [$label] production has no open shift"
    return 0
  fi
  echo "  !! [$label] /api/shifts/current still returns a shift"
  return 1
}

# ---------------------------------------------------------------------------
# EXIT GUARANTEE: whatever happens (failed assertion, curl timeout on the
# Aiven free tier, cancelled job), never leave production with a shift this
# script opened.
# ---------------------------------------------------------------------------
cleanup_on_exit() {
  local exit_code=$?
  if [ -n "$OPENED_SHIFT_ID" ]; then
    note "EXIT CLEANUP — closing shift $OPENED_SHIFT_ID opened by this probe"
    if close_current_shift "exit-cleanup"; then
      OPENED_SHIFT_ID=""
    else
      CLEANUP_FAILED=1
    fi
  fi
  echo
  echo "############################################################"
  echo "LIVE PROD RESULT: $PASS passed, $FAIL failed"
  if [ "$CLEANUP_FAILED" -ne 0 ]; then
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo "!! CLEANUP FAILED — a shift opened by this probe is STILL OPEN"
    echo "!! on production ($WORKER). Close it now in the admin UI or"
    echo "!! with: POST /api/shifts/close  (admin → Shifts & cash)."
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  fi
  if [ "$STUCK_SHIFT" -ne 0 ]; then
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo "!! A REAL (non-CI) shift is open on production and this probe"
    echo "!! did not touch it. Nothing is broken — close it when the"
    echo "!! cashier finishes, or close it in the admin UI."
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  fi
  echo "############################################################"
  if [ "$CLEANUP_FAILED" -ne 0 ] || [ "$STUCK_SHIFT" -ne 0 ] || [ "$FAIL" -ne 0 ]; then
    exit 1
  fi
  exit "$exit_code"
}
trap cleanup_on_exit EXIT
trap 'echo; echo "!! interrupted — running cleanup"; exit 130' INT TERM

echo "############################################################"
echo "# LIVE PRODUCTION PROBE — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "# Worker: $WORKER"
echo "# VM:     $VM"
LIFECYCLE_STATE="SKIPPED (read-only probe)"
if [ "$LIVE_PROD_SHIFT_LIFECYCLE" = "1" ]; then LIFECYCLE_STATE="ENABLED (mutating)"; fi
echo "# Shift lifecycle: $LIFECYCLE_STATE"
echo "############################################################"

# ---------- 1. Reachability (retry: the Aiven free tier sleeps and can take
#              a few seconds to accept connections again) ----------
note "1. Reachability"
for base in "$WORKER" "$VM"; do
  for attempt in 1 2 3 4 5; do
    req "healthz ($base, attempt $attempt)" "$base" GET /healthz
    [ "$(cat "$OUT/last.code")" = "200" ] && break
    sleep 5
  done
  expect_code "healthz returns 200 ($base)" 200
done

# ---------- 1b. CORS ----------
# The three browser origins must be allowed, or the apps cannot call the API
# at all. Checked on EVERY run because this is what the media library broke
# with: an exception unwound past HandleCors and the browser reported a
# "blocked by CORS policy" error that hid the real 500 underneath.
note "1b. CORS preflight from the real browser origins"
CORS_ORIGINS="${CORS_ORIGINS:-https://g-cake-admin.system-app.workers.dev https://g-cake-sale.system-app.workers.dev https://g-cake-shop.system-app.workers.dev}"
for origin in $CORS_ORIGINS; do
  ACAO="$(curl -sS --max-time 30 -o /dev/null -D - -X OPTIONS \
    -H "Origin: $origin" \
    -H 'Access-Control-Request-Method: GET' \
    -H 'Access-Control-Request-Headers: authorization,content-type' \
    "$WORKER/healthz" 2>/dev/null |
    tr -d '\r' | grep -i '^access-control-allow-origin:' |
    head -n1 | cut -d' ' -f2-)"
  assert "CORS: preflight from $origin is allowed" \
    "$([ "$ACAO" = "$origin" ] && echo true || echo false)"
done

# ---------- 2. Login + deployed version markers ----------
note "2. Login (admin) and deployed-version markers"
req "admin login" "$WORKER" POST /api/login "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}"
expect_code "admin login returns 200" 200
TOKEN_ADMIN="$(json_field "$OUT/last.body" token "")"
assert "admin token issued" "$([ -n "$TOKEN_ADMIN" ] && echo true || echo false)"

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
try:
    d=json.load(open(sys.argv[1]))
except Exception:
    raise SystemExit
print("  summary keys:", sorted(d.keys()))
print("  has yesterdaySalesTotal (new):", 'yesterdaySalesTotal' in d)
print("  has itemsSold (new):", 'itemsSold' in d)
print("  has ordersData (new):", 'ordersData' in d)
print("  todaySalesTotal:", d.get('todaySalesTotal'))
PY

# ---------- 3. Shift state: never strand production, never fight a cashier ----------
note "3. Shift state on production"
req "GET /api/shifts/current (state check)" "$WORKER" GET /api/shifts/current "" "$TOKEN_ADMIN"
CURRENT_BODY="$(cat "$OUT/last.body" | tr -d '[:space:]')"
echo "  current shift on prod: $CURRENT_BODY"
if [ "$CURRENT_BODY" != "null" ] && [ -n "$CURRENT_BODY" ]; then
  OPENED_BY="$(json_field "$OUT/last.body" openedBy '?')"
  OPENING_FLOAT="$(json_field "$OUT/last.body" openingCash '?')"
  OPENING_KHR="$(json_field "$OUT/last.body" openingCashKhr '?')"
  OPENING_FLOAT_N="$(norm_money "$OPENING_FLOAT")"
  MINE="false"
  for f in $CI_FLOATS; do
    if [ "$OPENING_FLOAT_N" = "$(norm_money "$f")" ] && [ "$OPENING_KHR" = "0" ]; then MINE="true"; fi
  done
  if [ "$MINE" = "true" ]; then
    banner "STALE CI SHIFT ON PRODUCTION — self-healing"
    echo "# /api/shifts/current returned an open shift that this probe almost"
    echo "# certainly opened on an earlier run:"
    echo "#   openedBy=$OPENED_BY openingCash=$OPENING_FLOAT openingCashKhr=$OPENING_KHR"
    echo "# Closing it now so the store is not stuck. If a real cashier IS"
    echo "# using it, re-open it in the admin UI — its float is unchanged."
    echo "############################################################"
    if close_current_shift "stale-ci-recovery"; then
      echo "  RECOVERED — production has no open shift again"
    else
      CLEANUP_FAILED=1
    fi
  else
    STUCK_SHIFT=1
    banner "A REAL SHIFT IS OPEN ON PRODUCTION — lifecycle skipped"
    echo "# openedBy=$OPENED_BY openingCash=$OPENING_FLOAT openingCashKhr=$OPENING_KHR"
    echo "# This is NOT a CI leftover, so the probe will not touch it. The"
    echo "# admin/sale apps are correct: they show Open because a shift is"
    echo "# open on the server. The read-only sweep below still runs."
    echo "############################################################"
  fi
fi

if [ "$LIVE_PROD_SHIFT_LIFECYCLE" != "1" ]; then
  note "3b. Shift lifecycle SKIPPED (set LIVE_PROD_SHIFT_LIFECYCLE=1 to run it)"
  echo "  Covered by the backend-e2e and ui jobs against an ephemeral MySQL,"
  echo "  which carry zero production risk. Two CI pushes racing on the one"
  echo "  global shift is exactly how production got stranded before."
elif [ "$STUCK_SHIFT" -ne 0 ]; then
  note "3b. Shift lifecycle SKIPPED (a real shift is open — see above)"
else
  note "3b. Shift lifecycle on production (cleanup guaranteed by EXIT trap)"

  req "cashier login" "$WORKER" POST /api/login "{\"email\":\"$CI_CASHIER_EMAIL\",\"password\":\"$CI_CASHIER_PASS\"}"
  expect_code "cashier login returns 200" 200
  TOKEN_CASHIER="$(json_field "$OUT/last.body" token "")"
  CASHIER_NAME="$(python3 - "$OUT/last.body" <<'PY'
import json,sys
try: print(json.load(open(sys.argv[1]))['employee']['name'])
except Exception: print("?")
PY
)"
  echo "  cashier: $CASHIER_NAME"

  req "open shift" "$WORKER" POST /api/shifts/open '{"openingCash":100.00}' "$TOKEN_CASHIER"
  expect_code "open shift returns 201" 201
  SHIFT_ID="$(json_field "$OUT/last.body" id "")"
  if [ -n "$SHIFT_ID" ] && [ "$SHIFT_ID" != "?" ]; then OPENED_SHIFT_ID="$SHIFT_ID"; fi
  echo "  opened shift id: $SHIFT_ID"

  req "current shift (open)" "$WORKER" GET /api/shifts/current "" "$TOKEN_ADMIN"
  assert "current shift is Open" "$([ "$(json_field "$OUT/last.body" status '')" = "Open" ] && echo true || echo false)"

  req "cashier logout" "$WORKER" POST /api/logout '{}' "$TOKEN_CASHIER"
  expect_code "logout returns 200" 200

  req "cashier relogin" "$WORKER" POST /api/login "{\"email\":\"$CI_CASHIER_EMAIL\",\"password\":\"$CI_CASHIER_PASS\"}"
  expect_code "relogin returns 200" 200
  TOKEN_CASHIER2="$(json_field "$OUT/last.body" token "")"
  req "current shift with new token" "$WORKER" GET /api/shifts/current "" "$TOKEN_CASHIER2"
  assert "shift is STILL OPEN after relogin" "$([ "$(json_field "$OUT/last.body" status '')" = "Open" ] && echo true || echo false)"
  assert "same shift id persists" "$([ "$(json_field "$OUT/last.body" id '')" = "$SHIFT_ID" ] && echo true || echo false)"

  req "close shift (no sales yet => closing 100 = balanced)" "$WORKER" POST /api/shifts/close '{"closingCash":100.00}' "$TOKEN_CASHIER2"
  expect_code "close shift returns 200" 200
  echo "  close body: $(head -c 400 "$OUT/last.body")"

  req "current shift after close" "$WORKER" GET /api/shifts/current "" "$TOKEN_ADMIN"
  assert "no open shift after close" "$([ "$(cat "$OUT/last.body" | tr -d '[:space:]')" = "null" ] && echo true || echo false)"
  if [ "$(cat "$OUT/last.body" | tr -d '[:space:]')" = "null" ]; then OPENED_SHIFT_ID=""; fi

  req "close an already-closed shift" "$WORKER" POST /api/shifts/close '{"closingCash":100.00}' "$TOKEN_CASHIER2"
  expect_code "double close rejected with 409" 409

  req "open shift (second attempt setup)" "$WORKER" POST /api/shifts/open '{"openingCash":50.00}' "$TOKEN_CASHIER2"
  expect_code "reopen returns 201" 201
  SHIFT_ID2="$(json_field "$OUT/last.body" id "")"
  if [ -n "$SHIFT_ID2" ] && [ "$SHIFT_ID2" != "?" ]; then OPENED_SHIFT_ID="$SHIFT_ID2"; fi
  req "open a second shift while one is open" "$WORKER" POST /api/shifts/open '{"openingCash":50.00}' "$TOKEN_ADMIN"
  expect_code "second open rejected with 409" 409
  req "cleanup: close the open shift" "$WORKER" POST /api/shifts/close '{"closingCash":50.00}' "$TOKEN_ADMIN"
  expect_code "cleanup close returns 200" 200
  req "verify no open shift after cleanup" "$WORKER" GET /api/shifts/current "" "$TOKEN_ADMIN"
  if [ "$(cat "$OUT/last.body" | tr -d '[:space:]')" = "null" ]; then OPENED_SHIFT_ID=""; fi
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
