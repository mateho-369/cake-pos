#!/usr/bin/env bash
#
# Proves the live-prod probe can never strand production with an open shift.
# It runs backend/tests/e2e/live-prod.sh against a stub "production" API
# (live-prod-stub.mjs) and asserts the end state after each failure mode:
#
#   A. happy path                -> no open shift, exit 0
#   B. SIGTERM mid-lifecycle     -> trap still closes it  (the timeout case)
#   C. close fails twice, then OK-> retried, no open shift
#   D. close never succeeds      -> loudly reports and exits non-zero
#   E. stale CI shift at start   -> self-heals, no open shift
#   F. real cashier shift        -> NOT closed, exits non-zero (loud skip)
#   G. lifecycle disabled        -> read-only, no shift ever opened
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

# ---- A: happy path ---------------------------------------------------------
run_case A 1 X=1
check "A: probe exits 0 on the happy path" "$([ "$LAST_EXIT" = 0 ] && echo true || echo false)"
check "A: production left with NO open shift" \
  "$([ "$CURRENT_AFTER" = "null" ] && echo true || echo false)"

# ---- B: killed mid-lifecycle (network blip / job cancelled) ----------------
echo; echo "===== CASE B: SIGTERM mid-lifecycle ====="
start_stub SLOW_LOGOUT_MS=20000 || { FAIL=$((FAIL + 1)); }
B_LOG="$SELFTEST_DIR/B.log"
WORKER_URL="http://127.0.0.1:$PORT" VM_URL="http://127.0.0.1:$PORT" \
CORS_ORIGINS="http://127.0.0.1:$PORT" \
LIVE_PROD_SHIFT_LIFECYCLE=1 bash "$ROOT/backend/tests/e2e/live-prod.sh" >"$B_LOG" 2>&1 &
B_PID=$!
# Wait until the shift is open (the probe is parked in the slow logout).
for _ in $(seq 1 60); do
  [ "$(current_shift | tr -d '[:space:]')" != "null" ] && break
  sleep 0.5
done
check "B: a shift was really open when the probe was killed" \
  "$([ "$(current_shift | tr -d '[:space:]')" != "null" ] && echo true || echo false)"
kill -TERM "$B_PID" 2>/dev/null
wait "$B_PID"; B_EXIT=$?
sleep 1
check "B: EXIT trap closed it anyway (no open shift left)" \
  "$([ "$(current_shift | tr -d '[:space:]')" = "null" ] && echo true || echo false)"
check "B: probe exited non-zero (interrupted)" "$([ "$B_EXIT" != 0 ] && echo true || echo false)"
check "B: log mentions the cleanup ran" "$(grep -q 'EXIT CLEANUP' "$B_LOG" && echo true || echo false)"
stop_stub

# ---- C: every in-script close fails; only the EXIT trap can save it --------
# 4 failures: the three closes the lifecycle itself issues, plus the trap's
# first attempt. The trap must retry and win.
run_case C 1 FAIL_CLOSE_TIMES=4
check "C: EXIT trap took over and retried the close" \
  "$(grep -q 'exit-cleanup, attempt 2' "$LAST_LOG" && echo true || echo false)"
check "C: production left with NO open shift" \
  "$([ "$CURRENT_AFTER" = "null" ] && echo true || echo false)"

# ---- D: close never succeeds ----------------------------------------------
run_case D 1 FAIL_CLOSE_TIMES=99
check "D: probe exits non-zero" "$([ "$LAST_EXIT" != 0 ] && echo true || echo false)"
check "D: screams that cleanup failed" \
  "$(grep -q 'CLEANUP FAILED' "$LAST_LOG" && echo true || echo false)"

# ---- E: stale CI shift already open at start -------------------------------
echo; echo "===== CASE E: stale CI shift present ====="
start_stub SEED_SHIFT=ci
check "E: a CI-owned shift is open before the probe" \
  "$([ "$(current_shift | tr -d '[:space:]')" != "null" ] && echo true || echo false)"
E_LOG="$SELFTEST_DIR/E.log"
WORKER_URL="http://127.0.0.1:$PORT" VM_URL="http://127.0.0.1:$PORT" \
CORS_ORIGINS="http://127.0.0.1:$PORT" \
LIVE_PROD_SHIFT_LIFECYCLE=1 bash "$ROOT/backend/tests/e2e/live-prod.sh" >"$E_LOG" 2>&1
E_EXIT=$?
check "E: probe self-healed the stale shift" \
  "$([ "$(current_shift | tr -d '[:space:]')" = "null" ] && echo true || echo false)"
check "E: reported it loudly" "$(grep -q 'STALE CI SHIFT' "$E_LOG" && echo true || echo false)"
check "E: still exits 0 (recovered, nothing broken)" "$([ "$E_EXIT" = 0 ] && echo true || echo false)"
stop_stub

# ---- F: a real cashier's shift is open -------------------------------------
echo; echo "===== CASE F: real cashier shift present ====="
start_stub SEED_SHIFT=real
F_LOG="$SELFTEST_DIR/F.log"
WORKER_URL="http://127.0.0.1:$PORT" VM_URL="http://127.0.0.1:$PORT" \
CORS_ORIGINS="http://127.0.0.1:$PORT" \
LIVE_PROD_SHIFT_LIFECYCLE=1 bash "$ROOT/backend/tests/e2e/live-prod.sh" >"$F_LOG" 2>&1
F_EXIT=$?
check "F: did NOT close the real shift" \
  "$([ "$(current_shift | tr -d '[:space:]')" != "null" ] && echo true || echo false)"
check "F: exits non-zero so a human notices" "$([ "$F_EXIT" != 0 ] && echo true || echo false)"
check "F: says why it skipped" "$(grep -q 'A REAL SHIFT IS OPEN' "$F_LOG" && echo true || echo false)"
stop_stub

# ---- G: lifecycle disabled (default on push) -------------------------------
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

echo
echo "############################################################"
echo "LIVE-PROD SELF-TEST: $PASS passed, $FAIL failed"
echo "############################################################"
[ "$FAIL" -eq 0 ] || exit 1
