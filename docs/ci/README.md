# Pending CI change — needs the repo owner to push

`.github/workflows/test.yml` cannot be pushed by the Arena agent: its GitHub
App token does not carry the `workflows` permission, and GitHub rejects both
`git push` and the contents API for any file under `.github/workflows/`.

This folder holds the **exact** file that is waiting, so landing it is one
copy:

```bash
cp docs/ci/test.yml .github/workflows/test.yml
git add .github/workflows/test.yml
git commit -m "ci: queue-verify + mobile audit + arena/** triggers"
git push
```

(Or reconnect GitHub in Arena with the `workflows` scope and ask the agent to
push it.)

## What the file changes

| Change | Why |
| --- | --- |
| trigger on `arena/**` branches | agent branches get CI instead of waiting for `main` |
| `QUEUE_CONNECTION=database` in **backend-e2e** | queued jobs must sit in the MySQL `jobs` table, not run inline |
| `STAFF_TELEGRAM_BOT_TOKEN=123:staff-ci-token`, `STAFF_NOTIFICATION_CHAT_ID=424242`, `TELEGRAM_API_BASE=http://127.0.0.1:8090` | point staff notifications at the local Telegram API stub |
| new step `bash backend/tests/e2e/queue-verify.sh` | proves a completed sale goes **jobs table → `php artisan queue:work` → real HTTP POST**, not just "a job class exists" |
| new ui step `node e2e/ui/mobile-audit.mjs` | phone-width (390px + 360px) overflow / auto-zoom audit of admin pages + modals and the sale terminal |
| frontend job runs `e2e/unit/unit-tests.mjs` + `e2e/locale-audit.mjs` | the dual-currency math, split tender and en/km parity checks were never in CI |
| frontend job runs `backend/tests/e2e/live-prod-selftest.sh` | proves the live-prod probe cannot strand a shift, on every push, without touching production |
| `live-prod` job gets a `concurrency: group: live-prod` | two pushes to `main` can no longer race on the one global production shift |
| `live-prod` passes `LIVE_PROD_SHIFT_LIFECYCLE=1` **only** on `workflow_dispatch` | the mutating open/close lifecycle stops running on every push; `backend-e2e`/`ui` already cover it on throwaway MySQL |
| `live-prod` healthz probes retry 5× | the Aiven free tier sleeps after inactivity and the first request can time out |

Until it lands, pushes to `arena/**` run the **old** workflow (smoke +
PHPUnit + typecheck/build/exports + ui-smoke), so the three new checks above
simply do not run yet.

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

# 2. Close it with its own expected float (variance stays 0). Use the
#    expectedCashUsdCents value from step 1 divided by 100:
curl -sS -X POST "$API/api/shifts/close" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"closingCash":100.00,"closingCashKhr":0}'

# 3. Confirm it is gone (must print null):
curl -sS "$API/api/shifts/current" -H "Authorization: Bearer $TOKEN"
```

If the open shift was **not** opened by `Sophea Chan` with those exact round
floats, a real cashier is using it — close it from the admin UI
(**Shifts & cash**) instead, or let them close it out normally.

Once the workflow above lands, the probe also heals this by itself: a stale
CI-owned shift found at start-up is closed and reported loudly
(`STALE CI SHIFT ON PRODUCTION — self-healing`), while a real cashier's
shift is never touched (the job fails loudly instead).
