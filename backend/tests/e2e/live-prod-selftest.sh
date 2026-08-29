#!/usr/bin/env bash
#
# Proves the live-prod probe is STRICTLY READ-ONLY and can never close a
# production shift. It runs backend/tests/e2e/live-prod.sh against a stub
# "production" API (live-prod-stub.mjs) and asserts:
#
#   A. probe never opens a shift (lifecycle removed)       -> exit 0
#   E. a shift that looks like an old CI leftover at start -> NOT closed
#   F. a real cashier shift at start                       -> NOT closed
#   G. read-only sweep leaves no open shift
#   H/I/J CORS, stale-cache and {} ghost-shift checks unchanged
#
# Usage: bash backend/tests/e2e/live-prod-selftest.sh
set -uo pipefail

# backend/tests/e2e/<this file> -> repo root is three levels up
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SELFTEST_DIR="$(mktemp -d)"
PORT="${PORT:-8099}"
PASS=0
FAIL=0

check() {
  if [ "$2" = "true" ]; then PASS=$((PASS + 1)); echo "  PASS  $1"
  else FAIL=$((FAIL + 1)); echo "  FAIL  $1"; fi
}

start_stub() { # env assignments...
  env "$@" PORT="$PORT" node "$ROOT/backend/tests/e2e/live-prod-stub.mjs" \
    >"$SELFTEST_DIR/stub.log" 2>&1 &
  STUB_PID=$!
  for _ in $(seq 1 40); do
    curl -sf "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && return 0
    sleep 0.25
  done
  echo "  stub failed to start"; cat "$SELFTEST_DIR/stub.log"; return 1
}
stop_stub() { kill "$STUB_PID" 2>/dev/null || true; wait "$STUB_PID" 2>/dev/null || true; }
current_shift() { curl -sS --max-time 10 "http://127.0.0.1:$PORT/api/shifts/current" 2>/dev/null; }

run_case() { # name lifecycle stub_env... -> sets LAST_EXIT, LAST_LOG
  local name="$1" lifecycle="$2"; shift 2
  echo; echo "===== CASE $name ====="
  start_stub "$@" || { FAIL=$((FAIL + 1)); return; }
  LAST_LOG="$SELFTEST_DIR/$name.log"
  WORKER_URL="http://127.0.0.1:$PORT" \
  VM_URL="http://127.0.0.1:$PORT" \
  CORS_ORIGINS="http://127.0.0.1:$PORT" \
  LIVE_PROD_SHIFT_LIFECYCLE="$lifecycle" \
    bash "$ROOT/backend/tests/e2e/live-prod.sh" >"$LAST_LOG" 2>&1 &
  local probe_pid=$!
  wait "$probe_pid"
  LAST_EXIT=$?
  # Read the end state BEFORE the stub goes away.
  CURRENT_AFTER="$(current_shift | tr -d '[:space:]')"
  stop_stub
}

echo "############ LIVE-PROD SAFETY SELF-TEST ############"

# ---- A: read-only, lifecycle removed --------------------------------------
run_case A 1 X=1
check "A: probe exits 0 on the read-only happy path" "$([ "$LAST_EXIT" = 0 ] && echo true || echo false)"
check "A: production left with NO open shift" \
  "$([ "$CURRENT_AFTER" = "null" ] && echo true || echo false)"
check "A: log says the mutating lifecycle was removed" \
  "$(grep -q 'lifecycle REMOVED' "$LAST_LOG" && echo true || echo false)"
check "A: probe never opened a shift" \
  "$(! grep -q 'opened shift id' "$LAST_LOG" && echo true || echo false)"

# ---- E: a shift that matches the old CI floats must NOT be closed ---------
echo; echo "===== CASE E: old-CI-lookalike shift present (read-only) ====="
start_stub SEED_SHIFT=ci
E_LOG="$SELFTEST_DIR/E.log"
WORKER_URL="http://127.0.0.1:$PORT" VM_URL="http://127.0.0.1:$PORT" \
CORS_ORIGINS="http://127.0.0.1:$PORT" \
LIVE_PROD_SHIFT_LIFECYCLE=1 bash "$ROOT/backend/tests/e2e/live-prod.sh" >"$E_LOG" 2>&1
E_EXIT=$?
check "E: did NOT close the CI-lookalike shift" \
  "$([ "$(current_shift | tr -d '[:space:]')" != "null" ] && echo true || echo false)"
check "E: log says the probe is read-only" \
  "$(grep -q 'OPEN SHIFT DETECTED — READ-ONLY' "$E_LOG" && echo true || echo false)"
check "E: no self-healing close ran" \
  "$(! grep -q 'self-healing' "$E_LOG" && echo true || echo false)"
check "E: exits 0 — detecting a shift is not a probe failure" \
  "$([ "$E_EXIT" = 0 ] && echo true || echo false)"
stop_stub

# ---- F: a real cashier's shift is open (read-only) ------------------------
echo; echo "===== CASE F: real cashier shift present (read-only) ====="
start_stub SEED_SHIFT=real
F_LOG="$SELFTEST_DIR/F.log"
WORKER_URL="http://127.0.0.1:$PORT" VM_URL="http://127.0.0.1:$PORT" \
CORS_ORIGINS="http://127.0.0.1:$PORT" \
LIVE_PROD_SHIFT_LIFECYCLE=1 bash "$ROOT/backend/tests/e2e/live-prod.sh" >"$F_LOG" 2>&1
F_EXIT=$?
check "F: did NOT close the real shift" \
  "$([ "$(current_shift | tr -d '[:space:]')" != "null" ] && echo true || echo false)"
check "F: log says the probe is read-only" \
  "$(grep -q 'A SHIFT IS OPEN ON PRODUCTION' "$F_LOG" && echo true || echo false)"
check "F: exits 0 — never touching another operator's shift is correct" \
  "$([ "$F_EXIT" = 0 ] && echo true || echo false)"
stop_stub

# ---- G: read-only sweep ---------------------------------------------
run_case G 0 X=1
check "G: no shift was ever opened" \
  "$(! grep -q 'opened shift id' "$LAST_LOG" && echo true || echo false)"
check "G: production left with NO open shift" \
  "$([ "$CURRENT_AFTER" = "null" ] && echo true || echo false)"

# ---- H: a browser origin that is not allowed must fail loudly --------------
run_case H 1 ALLOWED_ORIGINS="https://not-the-real-origin.example"
check "H: CORS probe fails when the origin is not allowed" \
  "$(grep -q 'FAIL  CORS: preflight' "$LAST_LOG" && echo true || echo false)"
check "H: probe exits non-zero on the CORS failure" \
  "$([ "$LAST_EXIT" != 0 ] && echo true || echo false)"
check "H: read-only sweep still ran after the CORS failure" \
  "$(grep -q 'Read-only endpoint sweep' "$LAST_LOG" && echo true || echo false)"

# ---- I: a URL-keyed cache in front serves a stale /current -----------------
# The stub returns a closed shift's last OPEN snapshot on the plain URL but
# the truth on ?cb= reads — the production symptom the cache forensics exist
# to catch (plain /current said Open while /api/shifts said long Closed).
run_case I 0 SIMULATE_STALE_EDGE_CACHE=1 SEED_SHIFT=closed-ci
check "I: probe proves the cache-busted read differs (URL-keyed stale cache)" \
  "$(grep -q 'STALE-CACHE-PROOF' "$LAST_LOG" && echo true || echo false)"
check "I: probe cross-checks /current against /api/shifts in the same run" \
  "$(grep -q 'STALE-SHIFT' "$LAST_LOG" && echo true || echo false)"
check "I: probe acts on the cache-busted truth (no self-heal on a phantom)" \
  "$(grep -q 'cache-busted truth' "$LAST_LOG" && ! grep -q 'self-healing' "$LAST_LOG" && echo true || echo false)"
check "I: exits non-zero — a stale cache is a bug worth failing CI for" \
  "$([ "$LAST_EXIT" != 0 ] && echo true || echo false)"

# ---- J: backend answers "no shift" as {} — the production ghost shift ------
# What production actually serves today (stale deploy): HTTP 200 {} instead
# of null. The probe must flag it loudly and must NOT call it a real shift.
run_case J 0 EMPTY_OBJECT_CURRENT=1
check "J: forensics labels the body an error/empty response, not shift JSON" \
  "$(grep -q 'current-probe-errored' "$LAST_LOG" && echo true || echo false)"
check "J: probe flags {} as not-a-shift" \
  "$(grep -q 'current-body-not-a-shift' "$LAST_LOG" && echo true || echo false)"
check "J: does NOT mistake {} for a real cashier's shift" \
  "$(! grep -q 'A REAL SHIFT IS OPEN' "$LAST_LOG" && echo true || echo false)"
check "J: exits non-zero — a malformed backend answer fails loudly" \
  "$([ "$LAST_EXIT" != 0 ] && echo true || echo false)"

echo
echo "############################################################"
echo "LIVE-PROD SELF-TEST: $PASS passed, $FAIL failed"
echo "############################################################"
[ "$FAIL" -eq 0 ] || exit 1
