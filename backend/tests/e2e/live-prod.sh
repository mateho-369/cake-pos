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
  local args=(-sS --max-time 30 -D "$OUT/last.headers" -X "$method" -H 'Accept: application/json' -w '\n%{http_code}')
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

# Surface a finding as a GitHub check-run annotation — the ONLY probe output
# visible in the Actions UI / API without downloading job logs. Gated to the
# real production Worker on a real runner: the local self-test (live-prod
# -selftest.sh) drives this script against a stub, and stub "findings" must
# never pollute anyone's annotations.
annotate() { # level title message
  echo "  [annotate:$1] $2 — $3"
  if [ "${GITHUB_ACTIONS:-false}" = "true" ] && \
     [ "$WORKER" = "https://g-cake-api.system-app.workers.dev" ]; then
    printf '::%s title=%s::%s\n' "$1" \
      "$(printf '%s' "$2" | sed -e 's/%/%25/g' -e 's/\r/%0D/g' -e 's/\n/%0A/g' -e 's/:/%3A/g' -e 's/,/%2C/g')" \
      "$(printf '%s' "$3" | sed -e 's/%/%25/g' -e 's/\r/%0D/g' -e 's/\n/%0A/g')"
  fi
}

hdr() { # header-name -> first value captured from the last response
  tr -d '\r' <"$OUT/last.headers" 2>/dev/null | grep -i "^$1:" | head -n1 | cut -d' ' -f2-
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
  annotate notice "live-prod-result" \
    "$PASS passed, $FAIL failed (stale-cache-gate=${CACHE_STALE_CURRENT:-0}, stuck-real-shift=$STUCK_SHIFT, cleanup-failed=$CLEANUP_FAILED)"
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
annotate notice "admin-login" \
  "HTTP $(cat "$OUT/last.code"); token ${#TOKEN_ADMIN} chars; body (first 160): $(head -c 160 "$OUT/last.body" | tr '\n' ' ')"
if [ -z "$TOKEN_ADMIN" ]; then
  annotate error "admin-login-failed" \
    "login returned HTTP $(cat "$OUT/last.code") with no token — every authenticated probe below will fail; body (first 200): $(head -c 200 "$OUT/last.body" | tr '\n' ' ')"
fi

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
SUMMARY_HAS_NEW_KEYS="$(python3 -c "import json
d = json.load(open('$OUT/last.body'))
print('yes' if 'itemsSold' in d and 'yesterdaySalesTotal' in d else 'no')" 2>/dev/null || echo unknown)"
annotate notice "deploy-markers" \
  "freshness=$FRESHNESS_CODE business-profile=$BP_CODE summary-has-new-keys=$SUMMARY_HAS_NEW_KEYS (404/404/no = production is running an OLD backend deploy)"

# ---------- 2c. Cache forensics on /api/shifts/current (READ-ONLY) ----------
# The badge and (twice) this probe's logs saw /api/shifts/current report an
# OPEN shift while /api/shifts in the SAME run showed that shift long Closed
# (id:1, closedAt 12:45:53Z, no second record). Shift responses now set
# Cache-Control: no-store, private, max-age=0, but older deployments did not
# and any shared cache in front of Laravel — the Cloudflare edge, via the
# g-cake-api Worker's plain fetch() passthrough, is the prime suspect — is
# free to keep serving the one moment the shift really was open. This battery
# settles it WITHOUT touching
# production: read /current twice (3s apart), once more with a cache-buster
# query (a URL-keyed cache MUST miss on it), once from the VM origin directly
# (no Cloudflare in front of it), and /api/shifts for ground truth. Only
# identity/state fields are compared, so a live shop taking sales mid-probe
# (counter drift) cannot false-positive a caching verdict.
note "2c. Cache forensics: is /api/shifts/current served stale from in front?"
CACHE_STALE_CURRENT=0
CURRENT_TRUTH_BODY=""
if [ -z "$TOKEN_ADMIN" ]; then
  echo "  (skipping — admin login already failed above)"
else
  req "current (A: plain, via Worker)" "$WORKER" GET /api/shifts/current "" "$TOKEN_ADMIN"
  cp "$OUT/last.body" "$OUT/curr-a.body"; cp "$OUT/last.code" "$OUT/curr-a.code"
  CF_CACHE_STATUS="$(hdr cf-cache-status)"
  AGE_HDR="$(hdr age)"
  CC_HDR="$(hdr cache-control)"
  ETAG_HDR="$(hdr etag)"
  DATE_HDR="$(hdr date)"
  echo "  --- response headers for /current (probe A) ---"
  sed 's/^/    /' "$OUT/last.headers" 2>/dev/null | head -30
  echo "  -----------------------------------------------"
  annotate notice "current-response-headers" \
    "cf-cache-status=[${CF_CACHE_STATUS:-absent}] cache-control=[${CC_HDR:-absent}] age=[${AGE_HDR:-absent}] etag=[${ETAG_HDR:-absent}] date=[${DATE_HDR:-absent}] (a cache HIT here would prove stale serving)"

  # Both forms are fine for the live-state bug: `no-store` is the preferred
  # explicit instruction; `no-cache, private` (what the current production
  # backend returns) also tells shared caches not to store a public copy, so
  # it cannot replay an old open-shift snapshot either. Anything else (absent,
  # public, max-age) leaves the edge free to cache it.
  if printf '%s' "$CC_HDR" | grep -qi 'no-store'; then
    assert "current shift response forbids shared caching (${CC_HDR:-absent})" true
    annotate notice "current-no-store" \
      "Cache-Control: ${CC_HDR} on /api/shifts/current — clients and edge caches are told not to reuse this live-state response"
  elif printf '%s' "$CC_HDR" | grep -qi 'no-cache' && printf '%s' "$CC_HDR" | grep -qi 'private'; then
    assert "current shift response forbids shared caching (${CC_HDR:-absent})" true
    annotate notice "current-no-store" \
      "Cache-Control: ${CC_HDR} on /api/shifts/current — no-cache + private also forbids a shared cache from replaying this live-state response"
  else
    assert "current shift response forbids shared caching (${CC_HDR:-absent})" false
    annotate error "current-cache-control" \
      "Cache-Control: ${CC_HDR:-absent} on /api/shifts/current — expected no-store, private, max-age=0 (or no-cache, private) so a shared cache cannot replay an old open-shift snapshot"
  fi

  case "$(printf '%s' "$CF_CACHE_STATUS" | tr '[:upper:]' '[:lower:]')" in
    hit|stale|revalidated|updating)
      assert "cf-cache-status: $CF_CACHE_STATUS — /current WAS served from a Cloudflare edge cache" false
      annotate error "edge-cache-hit" \
        "cf-cache-status: $CF_CACHE_STATUS on /api/shifts/current — the response did NOT come from Laravel; this is the stale-shift mechanism" ;;
    *)
      assert "no edge cache hit on /current (cf-cache-status: ${CF_CACHE_STATUS:-absent})" true ;;
  esac
  if [ -n "$AGE_HDR" ] && [ "$AGE_HDR" -gt 0 ] 2>/dev/null; then
    assert "Age: $AGE_HDR — /current is a cached copy $AGE_HDR seconds old" false
    annotate error "age-header" "/api/shifts/current carried Age: $AGE_HDR — a shared cache served a ${AGE_HDR}s-old copy"
  else
    assert "no Age header on /current (${AGE_HDR:-absent})" true
  fi

  sleep 3
  req "current (B: plain again, 3s later)" "$WORKER" GET /api/shifts/current "" "$TOKEN_ADMIN"
  cp "$OUT/last.body" "$OUT/curr-b.body"; cp "$OUT/last.code" "$OUT/curr-b.code"
  req "current (C: cache-buster query)" "$WORKER" GET "/api/shifts/current?cb=$RANDOM$RANDOM$RANDOM" "" "$TOKEN_ADMIN"
  cp "$OUT/last.body" "$OUT/curr-c.body"; cp "$OUT/last.code" "$OUT/curr-c.code"
  req "current (D: VM origin direct, no Cloudflare)" "$VM" GET /api/shifts/current "" "$TOKEN_ADMIN"
  cp "$OUT/last.body" "$OUT/curr-d.body"; cp "$OUT/last.code" "$OUT/curr-d.code"
  req "shifts list (same run, ground truth)" "$WORKER" GET /api/shifts "" "$TOKEN_ADMIN"
  cp "$OUT/last.body" "$OUT/shifts-list.body"; cp "$OUT/last.code" "$OUT/shifts-list.code"

  annotate notice "current-probe-codes" \
    "A=$(cat "$OUT/curr-a.code") B=$(cat "$OUT/curr-b.code") C=$(cat "$OUT/curr-c.code") D=$(cat "$OUT/curr-d.code") list=$(cat "$OUT/shifts-list.code"); A: $(head -c 100 "$OUT/curr-a.body" | tr '\n' ' '); C: $(head -c 100 "$OUT/curr-c.body" | tr '\n' ' '); D(origin): $(head -c 100 "$OUT/curr-d.body" | tr '\n' ' '); list: $(head -c 180 "$OUT/shifts-list.body" | tr '\n' ' ')"

  VERDICTS="$(python3 - "$OUT/curr-a.body" "$OUT/curr-b.body" "$OUT/curr-c.body" "$OUT/curr-d.body" "$OUT/shifts-list.body" \
                      "$OUT/curr-a.code" "$OUT/curr-c.code" "$OUT/curr-d.code" <<'PY'
import json, sys

def load_json(p):
    try:
        with open(p) as fh:
            return json.load(fh)
    except Exception:
        return "__unreadable__"

def load_code(p):
    try:
        with open(p) as fh:
            return fh.read().strip()
    except Exception:
        return "???"

A, B, C, D, L = (load_json(p) for p in sys.argv[1:6])
a_code, c_code, d_code = (load_code(p) for p in sys.argv[6:9])

# state fields only — money counters / timestamps may drift on a live shop
STATE = ("id", "status", "closedAt", "openedBy", "openingCashUsdCents")
def st(o):
    if o is None: return None
    if not isinstance(o, dict): return "<%s>" % type(o).__name__
    return {k: o.get(k) for k in STATE}

def is_err(o):
    return o == "__unreadable__" or (isinstance(o, dict) and o.get("id") is None)

if is_err(A):
    # An auth failure / 500 page is not shift JSON: caching comparisons are
    # meaningless, and nothing further in the probe should mistake this
    # body for an open shift.
    print("FAIL::current-probe-errored::GET /api/shifts/current did not return shift JSON (HTTP A=%s, cache-busted C=%s, VM-origin D=%s; body is an error/auth response, not 'null' and not a shift) — caching comparison skipped; this is NOT evidence of an open shift" % (a_code, c_code, d_code))
else:
    SA, SB, SC, SD = st(A), st(B), st(C), st(D)

    if SA == SB:
        print("PASS::repeat-read::a second plain read 3s later returned the same shift state: %s" % SA)
    else:
        print("INFO::state-drift::shift state changed between reads 3s apart (%s -> %s) — live activity, not necessarily a cache" % (SA, SB))

    if SA == SC:
        print("PASS::cache-buster::a cache-busted read matches the plain read — no URL-keyed cache served a different copy")
    else:
        print("FAIL::STALE-CACHE-PROOF::plain read = %s but ?cb= read = %s — a URL-keyed cache in front of the app served the stale copy" % (SA, SC))

    if d_code != "200":
        print("INFO::origin-direct::VM origin probe returned HTTP %s — Worker-vs-origin comparison skipped" % d_code)
    elif SA == SD:
        print("PASS::worker-vs-origin::the Worker and the VM origin agree on the current shift")
    else:
        print("FAIL::WORKER-ORIGIN-DIVERGE::Worker = %s but origin direct = %s — something between them served a different answer" % (SA, SD))

if not isinstance(L, list):
    print("INFO::current-vs-list::/api/shifts was not a JSON list — consistency check skipped")
elif A is None:
    print("PASS::current-vs-list::/current is null and the shift history (%d record(s)) has no open shift inside this run" % len(L))
elif is_err(A):
    print("INFO::current-vs-list::skipped because the /current body was an error response (see above)")
elif not isinstance(A, dict):
    print("INFO::current-vs-list::/current returned no shift object — consistency check skipped")
else:
    match = [s for s in L if isinstance(s, dict) and s.get("id") == A.get("id")]
    if not match:
        print("FAIL::PHANTOM-SHIFT::/current returned shift id=%s but /api/shifts captured moments later in this run has no such record" % A.get("id"))
    elif match[0].get("status") != A.get("status"):
        print("FAIL::STALE-SHIFT::/current says '%s' for shift id=%s while /api/shifts in this same run says '%s' (closedAt=%s) — the /current snapshot is stale" % (
            A.get("status"), A.get("id"), match[0].get("status"), match[0].get("closedAt")))
    else:
        print("PASS::current-vs-list::/current and /api/shifts agree (id=%s, status=%s)" % (A.get("id"), A.get("status")))
PY
)"
  echo "$VERDICTS" | sed 's/^/  /'
  while IFS= read -r verdict_line; do
    [ -n "$verdict_line" ] || continue
    V_SEV="${verdict_line%%::*}"
    V_REST="${verdict_line#*::}"
    V_LABEL="${V_REST%%::*}"
    V_DETAIL="${V_REST#*::}"
    case "$V_SEV" in
      PASS)
        assert "$V_LABEL — $V_DETAIL" true
        annotate notice "$V_LABEL" "$V_DETAIL" ;;
      INFO)
        echo "  (info) $V_LABEL: $V_DETAIL"
        annotate notice "$V_LABEL" "$V_DETAIL" ;;
      FAIL)
        assert "$V_LABEL — $V_DETAIL" false
        annotate error "$V_LABEL" "$V_DETAIL"
        case "$V_LABEL" in
          STALE-CACHE-PROOF|STALE-SHIFT|PHANTOM-SHIFT) CACHE_STALE_CURRENT=1 ;;
        esac ;;
    esac
  done <<< "$VERDICTS"

  # When the plain read was proven stale, trust the cache-busted read as the
  # server's actual truth for the shift-state handling below — never run the
  # self-healing close against a phantom.
  if [ "$(cat "$OUT/curr-c.code" 2>/dev/null || echo 000)" = "200" ]; then
    CURRENT_TRUTH_BODY="$(tr -d '[:space:]' <"$OUT/curr-c.body")"
  else
    CURRENT_TRUTH_BODY="$(tr -d '[:space:]' <"$OUT/curr-a.body")"
  fi
fi

# ---------- 3. Shift state: never strand production, never fight a cashier ----------
note "3. Shift state on production"
req "GET /api/shifts/current (state check)" "$WORKER" GET /api/shifts/current "" "$TOKEN_ADMIN"
CURRENT_CODE="$(cat "$OUT/last.code")"
CURRENT_BODY="$(cat "$OUT/last.body" | tr -d '[:space:]')"
echo "  current shift on prod (HTTP $CURRENT_CODE): $CURRENT_BODY"
# Only a 200 JSON body can speak about shift state. A 401/500 (or an HTML
# error page) used to fall into the "open shift detected" branch below and
# be treated as A REAL cashier's shift — exactly the false reading the
# cache-forensics section was built to disambiguate.
if [ "$CURRENT_CODE" != "200" ]; then
  assert "GET /api/shifts/current returns 200 (got $CURRENT_CODE) — shift state readable" false
  annotate error "current-state-check-failed" \
    "GET /api/shifts/current returned HTTP $CURRENT_CODE, not shift JSON: $(head -c 160 "$OUT/last.body" | tr '\n' ' ') — NOT treated as an open shift; investigate API health/auth"
  CURRENT_BODY=""
fi
if [ "${CACHE_STALE_CURRENT:-0}" = "1" ] && [ -n "$CURRENT_TRUTH_BODY" ]; then
  echo "  !! forensics PROVED the plain /current read is a stale cache artifact"
  echo "  !! acting on the cache-busted truth instead: $CURRENT_TRUTH_BODY"
  annotate error "stale-current-confirmed" \
    "the plain /api/shifts/current read is stale; cache-busted truth is: ${CURRENT_TRUTH_BODY:0:200} — see the cache forensics section"
  CURRENT_BODY="$CURRENT_TRUTH_BODY"
fi
# A 200 that is not 'null' must be a REAL shift object (one carrying its id).
# The stale production deploy answers "no open shift" as {} — which the old
# probe read as A REAL cashier's shift (any non-null body was "open"), the
# exact misreading that made the badge investigation look like a cache. Only
# a body with an id may enter the open-shift branch.
if [ "$CURRENT_BODY" != "null" ] && [ -n "$CURRENT_BODY" ]; then
  CURRENT_IS_SHIFT="$(printf '%s' "$CURRENT_BODY" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
except Exception:
    print('no'); raise SystemExit
print('yes' if isinstance(d, dict) and d.get('id') is not None else 'no')
")"
  if [ "$CURRENT_IS_SHIFT" != "yes" ]; then
    assert "GET /api/shifts/current returns 'null' or a shift object (got: ${CURRENT_BODY:0:80})" false
    annotate error "current-body-not-a-shift" \
      "HTTP 200 from /api/shifts/current is neither 'null' nor a shift object: ${CURRENT_BODY:0:160} — e.g. backend emitting {} (Symfony's json(null) -> empty ArrayObject), a stale deploy, or a transforming layer in front; the apps (and this probe) used to read that as an OPEN shift"
    CURRENT_BODY=""
  fi
fi
if [ "$CURRENT_BODY" != "null" ] && [ -n "$CURRENT_BODY" ]; then
  echo "  --- Raw response dump (open shift detected) ---"
  echo "  Headers:"
  sed 's/^/    /' "$OUT/last.headers" 2>/dev/null || true
  echo "  Raw body:"
  cat "$OUT/last.body" 2>/dev/null || true
  echo
  echo "  -----------------------------------------------"
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
SWEEP_CODES=""
for ep in /api/products /api/categories /api/customers /api/orders /api/employees /api/shifts /api/settings/pos-rules /api/settings/receipt-template /api/reports/dashboard /api/reports/revenue-trend /api/reports/products /api/reports/categories /api/reports/payments /api/reports/cashiers /api/reports/peak-hours /api/reports/waste /api/reports/customers; do
  req "GET $ep" "$WORKER" GET "$ep" "" "$TOKEN_ADMIN"
  expect_code "GET $ep returns 200" 200
  SWEEP_CODES="$SWEEP_CODES $ep=$(cat "$OUT/last.code")"
done
SWEEP_NON200="$(printf '%s\n' $SWEEP_CODES | grep -vc '=200$')"
if [ "$SWEEP_NON200" != "0" ]; then
  annotate error "read-only-sweep-failures" "non-200 endpoints:${SWEEP_CODES}"
else
  annotate notice "read-only-sweep" "all 17 endpoints returned 200"
fi

note "Admin logout"
req "logout" "$WORKER" POST /api/logout '{}' "$TOKEN_ADMIN"
expect_code "admin logout returns 200" 200
