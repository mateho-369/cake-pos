# CI mirror of `.github/workflows/test.yml`

`.github/workflows/test.yml` cannot be pushed by the Arena agent: its GitHub
App token does not carry the `workflows` permission, and GitHub rejects both
`git push` and the contents API for any file under `.github/workflows/`.

This folder holds the **exact** file. Keep the two in sync — landing the
workflow half of any CI change is one copy:

```bash
cp docs/ci/test.yml .github/workflows/test.yml
git add .github/workflows/test.yml
git commit -m "ci: <describe the change>"
git push
```

(Or reconnect GitHub in Arena with the `workflows` scope and ask the agent to
push it.)

Everything **outside** `.github/workflows/` (the e2e shell scripts, stubs and
self-tests) pushes normally, and a branch push already runs the workflow from
the branch — so `live-prod.sh` changes take effect the moment they are
pushed, even before the workflow file itself is re-landed.

## What the current file changes vs. the previously landed workflow

| Change | Why |
| --- | --- |
| `APP_KEY=` (bare, first line) in the **backend-e2e** and **ui** heredocs | `key:generate` only *replaces an existing* `APP_KEY=` line. With no such line in the heredoc it prints "Unable to set application key" and moves on — `.env` ends up keyless and **every** request 500s (`MissingAppKeyException`), `/healthz` and login included. |
| `APP_ENV=testing` and `APP_DEBUG=true` in both heredocs | CI-only: the next fatal shows a real stack trace instead of a generic "Server Error" page. Production's real `.env` is untouched. |
| `grep -q '^APP_KEY=base64:' .env` guard after `key:generate --force` in both jobs | `key:generate` exits 0 even when it set nothing. This fails the `.env` step loudly (`::error::`) instead of producing confusing downstream 500s. |

Companion script fixes pushed alongside (not workflow files, land anywhere):

| Change | Why |
| --- | --- |
| `smoke.sh`: single-quote the step labels containing `$100.00`/`$10.00`/`$20.00` | **The `line 109: $1: unbound variable` crash.** `"$100.00"` inside double quotes interpolates `$1` (+ literal `00.00`); the script is invoked with no positional args and runs under `set -u`, so the run died exactly at that line, mid-reporting. |
| `smoke.sh`: helper arity guards + `${N:-}` defaults in `req`/`assert`/`expect_code`/`jqget` | Any future short-called helper degrades to a loud FAIL line instead of another `set -u` abort that hides everything collected so far. |
| `live-prod.sh`: new read-only **cache forensics** section (2c) | Two `live-prod` runs saw `/api/shifts/current` report an OPEN shift while `/api/shifts` in the same run showed it long Closed — the signature of a shared cache (Cloudflare edge via the Worker passthrough) serving a stale snapshot. No `Cache-Control` is set anywhere in the backend, so nothing prevents it. The probe now dumps `/current` response headers, asserts `cf-cache-status` is not `HIT` and no `Age` header, compares plain-vs-`?cb=`-cache-busted reads, compares Worker-vs-VM-origin, and cross-checks `/current` against the `/api/shifts` list captured in the same run. Verdicts are emitted as check-run **annotations** (visible without downloading logs). When staleness is proven it acts on the cache-busted truth and refuses to self-heal a phantom shift. |
| `live-prod-stub.mjs`: freeze `openedAt` at open time; real `/api/shifts` list; `SIMULATE_STALE_EDGE_CACHE=1` + `SEED_SHIFT=closed-ci` fault injection | Lets the self-test reproduce the exact production symptom (plain URL says Open, `?cb=` and the list say Closed) and pin the forensics' detection + gating behaviour as CASE I (26 checks total). |

## Runbook: a shift is stuck Open in production

The agent cannot reach production from its sandbox (no egress to
`g-cake-api.system-app.workers.dev`), so closing a stranded shift is a human
step. Only one shift can be open store-wide, and admin/sale show **Open**
because that is the server's truth — not a frontend bug.

```bash
API=https://g-cake-api.system-app.workers.dev
TOKEN=$(curl -sS -X POST "$API/api/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@atelier.local","password":"ChangeMe123!"}' \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')

# 1. Look at it. A stranded CI shift looks like:
#    "openedBy":"Sophea Chan", "openingCash":100.0 or 50.0, "openingCashKhr":0
curl -sS "$API/api/shifts/current" -H "Authorization: Bearer $TOKEN"

# 1b. Is that answer even fresh?  A stale edge copy is the suspected badge
#     bug: cf-cache-status: HIT or an Age header proves it; a cache-buster
#     query must miss any URL-keyed cache and show the truth (null here):
curl -si "$API/api/shifts/current" -H "Authorization: Bearer $TOKEN" | grep -i 'cf-cache-status\|^age\|cache-control'
curl -sS "$API/api/shifts/current?cb=$RANDOM$RANDOM" -H "Authorization: Bearer $TOKEN"

# 2. Close it with its own expected float (variance stays 0). Use the
#    expectedCashUsdCents value from step 1 divided by 100:
curl -sS -X POST "$API/api/shifts/close" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"closingCash":100.00,"closingCashKhr":0}'

# 3. Confirm it is gone (must print null; re-check with another ?cb= read):
curl -sS "$API/api/shifts/current?cb=$RANDOM$RANDOM" -H "Authorization: Bearer $TOKEN"
```

If the open shift was **not** opened by `Sophea Chan` with those exact round
floats, a real cashier is using it — close it from the admin UI
(**Shifts & cash**) instead, or let them close it out normally.

Once the workflow above lands, the probe also heals this by itself: a stale
CI-owned shift found at start-up is closed and reported loudly
(`STALE CI SHIFT ON PRODUCTION — self-healing`), while a real cashier's
shift is never touched (the job fails loudly instead). If the forensics have
proven the open-shift reading is a **stale cache artifact**, the probe trusts
the cache-busted read and deliberately does not "heal" a phantom.
