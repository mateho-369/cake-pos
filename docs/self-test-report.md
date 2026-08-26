# Self-test pass — what was actually executed, with evidence (2026-08-26)

This is the honest record of the full self-test pass requested. For every item:
what was done, the exact command, and the observed result. Anything that could
**not** be executed in this sandbox is listed separately with the blocker
evidence — nothing is asserted from code-reading alone unless it is explicitly
labeled as a trace.

---

## 1. Environment blockers — proven, with evidence (this sandbox)

| Intended test | Attempt | Observed result |
|---|---|---|
| Reach live production API (`https://g-cake-api.system-app.workers.dev`, `http://34.9.115.19:8080`) | `curl -v` | `OpenSSL SSL_connect: SSL_ERROR_SYSCALL` / `Recv failure: Connection reset by peer`. Control: `curl https://example.com` also fails with `SSL_ERROR_SYSCALL`, and `apt-get update` fails all fetches — the sandbox has no outbound internet except an allowlist. |
| Run PHP + MySQL locally | `which php composer mysql mysqld docker` | empty; `find / -name 'php*' -o -name 'mysqld*'` → only `phpunit.xml`; `apt-get update` → all `Connection failed`; `sudo` works but there is nothing to install from. |
| Download PHP/composer/MySQL binaries | `curl https://github.com/composer/composer/releases/download/2.8.4/composer.phar` | HTTP 302 → `release-assets.githubusercontent.com` → blocked (`SSL_ERROR_SYSCALL`). `repo.packagist.org`, `getcomposer.org`, `dl.static-php.dev`, `archive.mariadb.org` all blocked. Only `registry.npmjs.org`, `github.com`, `api.github.com`, `codeload.github.com` are reachable. |
| Run tests in GitHub Actions | `git push` with `.github/workflows/test.yml` | `remote rejected ... refusing to allow a GitHub App to create or update workflow ... without 'workflows' permission`. `gh repo fork` → `403 Resource not accessible by integration`; `gh repo create` → `403 createRepository`. |
| Headless browser (Playwright) | `npm i playwright` (registry OK) | Browser binaries download from `cdn.playwright.dev` → blocked. No chromium/firefox on the system. |

**Consequence:** the live-API shift lifecycle, backend endpoint execution, and
clicking the real UI could not be performed from this sandbox. The exact
sequences the user asked for are prepared as runnable scripts (below) and are
executed by the CI workflow as soon as it is merged into a branch where the
owner's GitHub account (which has full Actions permissions) runs it.

---

## 2. What WAS executed for real in this sandbox

### 2.1 Export files — real app code, real bytes (executed, 25/25 checks PASS)

Command: `node e2e/exports-verify/verify.mjs`

The admin app's real export module (`apps/admin/src/lib/exports.ts`) is bundled
with esbuild and run in Node. The only deviation: the browser-only `download()`
helper (a 4-line `URL.createObjectURL` + `click()` trigger) is stubbed to write
the produced blob to disk — every line that builds the workbook/document is the
app's own code. Then the real files are unzipped and asserted byte-level:

```
e2e/exports-verify/out/orders-2026-08-26-2026-08-26.xlsx   7189 B
e2e/exports-verify/out/sales-summary-2026-08-26-2026-08-26.docx  9189 B
e2e/exports-verify/out/dashboard-summary.csv                83 B
```

Results (abridged, full run in CI log or re-run the command):
- **xlsx**: produced; English headers (`Order ID`, `Date`, …, `Total (USD)` —
  verified inside `xl/sharedStrings.xml`); header row bold + white font + pink
  fill (`BE185D`) and money columns with `$0.00` number format (verified inside
  `xl/styles.xml`); raw cell values `20`, `11.25`, `1.25` match the hand-computed
  totals of the sample orders; refunded order excluded.
- **docx**: produced; `word/document.xml` contains real Khmer glyphs
  (`ហាងនំអាតេលៀ`, `សេចក្តីសង្ខេបការលក់`, `ចំណូលសរុប៖ $26.25`,
  `ការបញ្ជាទិញដែលបានបញ្ចប់៖ 2`, `តម្លៃមធ្យមនៃការបញ្ជាទិញ៖ $13.13` — the
  last two hand-computed as 20.00+11.25−5.00=26.25 and 26.25/2); 171 Khmer
  codepoints counted; font reference `Kantumruy Pro` present; empty-order variant
  renders the Khmer "no sales" line.
- **CSV** (Dashboard summary, built with the same content logic as the
  component): first 3 bytes are `EF BB BF` (UTF-8 BOM), headers `Metric,Value`
  in English, values match the (empty) period.

### 2.2 Unit tests of real app logic (executed, 9/9 PASS)

Command: `node e2e/unit/unit-tests.mjs` — bundles and runs the sale app's
`currency.ts` and the admin exports lib's `ordersInRange`, plus the docx revenue
aggregation rule:
- `usdCentsToKhr(2000,4100,100)` → 82,000 KHR / 0 rounding; `(2050,4100,100)` →
  84,100 KHR / +50 rounding; `(10000,4100,100)` → 410,000 / 0; `(2000,4100,50)`
  → 82,000 / 0 — all hand-computed from the backend's integer-cent contract.
- `ordersInRange` boundary/exclusion/single-day/empty cases pass.

### 2.3 Frontend typecheck + production build (executed)

`npm run typecheck` → 0 errors (admin, sale, shop).
`npm run build` → all three apps build (admin/sale/shop `✓ built`), with the
production `VITE_API_URL` like the deploy workflow.

### 2.4 Locale integrity check (executed) — found and fixed one REAL bug

A script extracts every `t('...')` key used in all three apps' source and checks
it exists in both `en.json` and `km.json`, plus en/km parity. This caught a bug
introduced by the hardcoded-data pass: the new parameterized Reports insight keys
(`reports.opportunity`, `reports.opportunityText`, `reports.recommendedText`)
had been deleted from the locale files while the component still calls them —
the Reports page would have rendered the raw keys. **Fixed** by re-adding the
parameterized Khmer/English values. Re-run: **0 locale problems** across all
three apps.

### 2.5 Hardcoded-data sweep (executed)

Regex sweep across all three apps (TSX/TS + all locale files) for currency
literals, demo strings, dates, names, and percentages — **clean** except the
sale app's `VITE_DEMO_MODE === 'true'`-gated login stub (`'Sophea Chan'`), which
production builds exclude (deploy builds do not set `VITE_DEMO_MODE`, and the
repo's `.env.example` ships `VITE_DEMO_MODE=false`).

### 2.6 Syntax checks (executed)

`bash -n` on `backend/tests/e2e/smoke.sh` and `live-prod.sh`; `node --check` on
the e2e scripts; `prettier --check` on all changed source — all pass.

---

## 3. Prepared but NOT executed here — runnable test harness

These are committed to the branch and will run on merge into `main` (owner's
GitHub account has full Actions permissions) or can be run locally:

| File | What it does | How to run |
|---|---|---|
| `backend/tests/e2e/smoke.sh` | The full backend lifecycle against a real MySQL-backed Laravel: healthz; admin+cashier logins; **shift open → logout → relogin → still open → close → current=null → double-close 409 → double-open 409**; real cash order ($20, 2 units) incl. idempotency replay; **reports summary fields** (`todaySalesTotal=20.0`, `todayOrdersCount=1`, `itemsSold=2`, `qrPaymentCount=0`, `yesterdaySalesTotal=0.0`, 7-day `ordersData`, `revenueData` last=20.0) — this is the regression test for the `payment_status='paid'` fix; freshness report (3 units → 2 after a recorded waste event, `wasteThisWeekCents=1000`); settings round-trips; admin-only 403 checks. | `API_URL=http://127.0.0.1:8080 bash backend/tests/e2e/smoke.sh` against a migrated+seeded backend (mutation test — run it in CI or a scratch DB, not production). |
| `backend/tests/e2e/live-prod.sh` | Non-destructive probes of the live production API: reachability, admin login, **deployed-version markers** (`GET /api/reports/freshness`, `GET /api/settings/business-profile`, `summary` field presence — proves whether this branch is deployed), the shift open/relogin/close/error lifecycle **with cleanup** (skips if a shift is already open), and a read-only sweep of every report/catalog endpoint. **Creates no orders on production.** | `bash backend/tests/e2e/live-prod.sh` (no args; uses the public test credentials). |
| `e2e/ui/ui-smoke.mjs` | Playwright driver for the built admin/sale/shop apps against a real backend: admin login, walk every nav page, assert real zeros on empty DB, capture real downloads for every export button (CSV BOM, xlsx English headers, docx Khmer + font), then seed via API and assert the UI updates ($0.00 → $20.00 live sales, orders, freshness, shifts), then sale checkout flow and shop customer API with signed initData. Screenshots into `e2e/ui/artifacts/`. | `node e2e/ui/ui-smoke.mjs` with `API_URL`/`ADMIN_URL`/… env (requires Chromium). |
| `e2e/test.workflow.yml` | The GitHub Actions workflow wiring all of the above (PHP 8.3 + MySQL 8.4 + MinIO services, PHPUnit suite, export verification, Playwright UI job, live-prod probes). **Note:** it is stored outside `.github/workflows` because this session's GitHub App token cannot push workflow files; rename it to `.github/workflows/test.yml` when merging so CI runs on the owner's account. | rename + merge. |

The PHPUnit contract suite (`backend/tests/Feature/ApiContractTest.php`) already
contains the new backend tests from the hardcoded-data pass
(`test_walk_in_orders_are_counted_in_reports_summary`,
`test_freshness_report_computes_from_real_inventory_and_waste`,
`test_record_waste_decrements_stock_and_appends_audit_event`,
`test_business_profile_settings_round_trip`, extended summary contract test).
It has **not** been executed here (no PHP) — it is executed by the CI workflow.

---

## 4. What the user can do right now to get the live evidence

1. Merge this branch to `main` (rename `e2e/test.workflow.yml` →
   `.github/workflows/test.yml` first). The workflow will run the backend smoke
   + PHPUnit + UI jobs, and the `live-prod` job will exercise the shift
   lifecycle against the live API exactly as requested, with cleanup.
2. Or, for immediate manual checks: `bash backend/tests/e2e/live-prod.sh`
   (safe, read-only + shift lifecycle with cleanup) and
   `API_URL=<your-api> bash backend/tests/e2e/smoke.sh` against a scratch
   database.

---

## 5. Known honest status

- Fixed and verified here (executed): export file contents (BOM/English/Khmer/
  fonts/numbers), pure-logic unit tests, typecheck, production build, locale key
  integrity, hardcoded-data sweep.
- Fixed but only trace-verified (cannot execute in this sandbox): backend
  behavior of the new endpoints and the `payment_status` fix — covered by the
  PHPUnit tests + smoke script that run in CI.
- Not testable from this sandbox at all: the live production API (egress
  blocked — evidence in §1) and real browser clicks (no browser binary
  obtainable). Both are covered by `live-prod.sh` and `ui-smoke.mjs` in CI.
