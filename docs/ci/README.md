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

Until it lands, pushes to `arena/**` run the **old** workflow (smoke +
PHPUnit + typecheck/build/exports + ui-smoke), so the three new checks above
simply do not run yet.
