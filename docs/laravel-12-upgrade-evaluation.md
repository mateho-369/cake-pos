# Laravel 12 upgrade — evaluation & execution plan (2026-08-28)

**Status:** Recommended. Documented — not yet executed (see §8 for why and what remains).

**Bottom line:** upgrade `backend/composer.json` to `laravel/framework: ^12.61.1`
(which resolves to **v12.68.0**, the current 12.x release). This is a small,
low-risk diff for this codebase: the Laravel 11 → 12 upgrade-guide changes
leave this app's code untouched, and every transitive dependency already in
`composer.lock` satisfies Laravel 12's constraints. The upgrade also clears
all three advisories currently reported against `laravel/framework v11.56.1`
and unblocks `composer update` for the whole project. PHP stays `^8.2`
(platform pin `8.2.0`); CI uses PHP 8.3 and the runtime image PHP 8.4 — both
supported by Laravel 12.

---

## 1. Why this is needed

### 1.1 Laravel 11 is end-of-life right now

| Version | Released | Bug fixes until | Security fixes until | Status (2026-08-28) |
|---|---|---|---|---|
| 11 | 2024-03-12 | 2025-09-03 | **2026-03-12** | **EOL** |
| 12 | 2025-02-24 | 2026-08-13 (already passed) | **2027-02-24** | security-only (≈6 months runway) |
| 13 | 2026-03-17 | Q3 2027 | 2028-03-17 | current major, requires **PHP ^8.3** |

Sources: [Laravel 12 release notes / support policy](https://v12.x.laravel.wiki/en/releases),
[Laravel versions & support status](https://benjamincrozat.com/laravel-versions),
[laravel/framework releases](https://github.com/laravel/framework/releases).

Because 11.x is EOL, the "no Laravel 11.x release is patched" observation is
permanent: **the only way to clear these advisories is to move major**.
Upgrading to 12.x now (minimal diff) also buys a runway to plan 13.x before
2027-02-24, which additionally needs a PHP floor bump to 8.3 (a separate,
smaller change — see §10).

### 1.2 The three flagged advisories (all affect the locked v11.56.1)

| # | Advisory / CVE | Severity | Affected ranges | Patched in | Fixed in 11.x? |
|---|---|---|---|---|---|
| 1 | [GHSA-5vg9-5847-vvmq](https://github.com/advisories/GHSA-5vg9-5847-vvmq) (PKSA-3r5d-mb8f-1qw9), [CVE-2026-48019](https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2026-48019) — **CRLF injection in default email rule** | **High** (CVSS 8.6/Av:N, AC:H, C:H/I:H/A:L, scope changed) | `< 12.60.0`, `>= 13.0.0, <= 13.9.0` | 12.60.0 / 13.10.0 | **No — branch EOL** |
| 2 | Same CRLF entry from FriendsOfPHP (PKSA-mdq4-51ck-6kdq / CVE-2026-48019) | High | `>= 11.0.0, < 12.0.0`, etc. | 12.60.0 / 13.10.0 | No |
| 3 | [GHSA-crmm-hgp2-wgrp](https://github.com/advisories/GHSA-crmm-hgp2-wgrp) (PKSA-m5cs-t1y6-qpcs) — **temporary signed URL path confusion** (local filesystem driver) | Medium (CVSS 4.2, PR:L) | `< 12.61.1`, `>= 13.0.0, < 13.12.0` | 12.61.1 / 13.12.0 | No |

Notes:

- #1 and #2 are the same underlying flaw listed twice (GitHub advisory DB +
  FriendsOfPHP), which is why `composer audit --locked` reports *three*
  advisories affecting one package. **`>= 12.61.1` clears all three** — the
  CRLF flaw at 12.60.0, the signed-URL flaw at 12.61.1, and the duplicate
  entry resolves with the CRLF fix.
- The fix for #1 is visible in the current 12.x source:
  `Illuminate\Validation\Concerns\ValidatesAttributes::validateEmail()` now
  rejects any value containing `\r` or `\n` *before* handing it to the
  EmailValidator / Symfony Mailer-Mime path
  (`preg_match('/[\r\n]/', (string) $value)` in `src/Illuminate/Validation/Concerns/ValidatesAttributes.php`).
- The advisory-policy interplay: `composer.json` has
  `config.policy.advisories.block: true` (restored in commit e299060). That
  means **`composer update` for anything is currently impossible** —
  resolving pulls in the vulnerable `laravel/framework`. Deploys are safe
  because they `composer install` from the committed lock (no resolution).
  The upgrade is therefore also the unblock for routine dependency updates.

## 2. Exposure analysis for THIS codebase

Good news: neither flaw has a live exploit path in the current app, but
neither is acceptable to leave on an EOL framework.

### CRLF email rule (#1/#2)

- User-supplied emails are validated with the `email` rule in exactly two
  places: `LoginRequest` (`nullable|email`) and `SaveEmployeeRequest`
  (`required|email`).
- **The app never sends email.** Grep confirms no `Mail::`, no Mailable
  classes, no `MAIL_*` keys in `.env.example`; all customer/staff
  notifications go over Telegram HTTP (jobs + `CustomerNotificationService` /
  `StaffNotificationService`), and mail config exists only as the skeleton
  default. `.env.example` has no mail settings at all.
- So today an attacker cannot reach a mail transport with a crafted address —
  **no exploitable outbound flow**. The residual risk is that any future
  email feature (password reset, receipts, broadcasts) would inherit the
  vulnerable validation on an EOL framework.
- Recommended regression test to add with the upgrade (a new
  `tests/Feature` case; on Laravel 11 this input currently passes validation,
  so ship the assertion with the upgrade):

  ```php
  // CRLF must be rejected by the default email rule (CVE-2026-48019)
  $this->postJson('/api/login', [
      'email' => "owner@example.com\r\nBcc: attacker@example.com",
      'password' => 'irrelevant',
  ])->assertStatus(422);
  ```

### Temporary signed URL path confusion (#3)

- The advertised attack surface is **local filesystem** temporary signed
  URLs (`Storage::disk('local')->temporaryUrl(...)`).
- This app's only presign path is
  `ObjectUploadService::presign()` → `Storage::disk('s3_upload')->temporaryUploadUrl()` —
  an S3/MinIO presigned PUT via the Flysystem S3 adapter (AWS SDK
  signature), not the local-driver signed-URL parser. There are **no calls
  to `Storage::temporaryUrl()`** anywhere in `app/`.
- Impact: not exploitable today; fixed by 12.61.1 regardless.

## 3. Laravel 12 breaking-change scan (upgrade guide vs this codebase)

Full guide: [Laravel 12.x upgrade guide](https://laravel.com/docs/12.x/upgrade).
Verified against the app (`backend/app`, `routes`, `config`, `database`):

| Guide item | Impact | This repo |
|---|---|---|
| Update framework to `^12.0`, phpunit `^11.0` | High | action (see §5) |
| Carbon 2 removed (Carbon 3 required) | Low | already `nesbot/carbon 3.13.2` ✓ |
| `HasUuids` now emits UUIDv7; `HasVersion4Uuids` new | Medium | no `HasUuids`/UUID model traits — models use integer keys ✓ |
| `image` rule excludes SVG by default | Low | `image` rule not used; upload MIME allowlist is `jpeg/png/webp` only ✓ |
| Local disk default root → `storage/app/private` | Low | `local` disk is **explicitly defined** with `root: storage_path('app/private')` — no behavior change ✓ |
| Container respects typed property defaults | Low | no nullable-typed constructor injection in providers/services; contract tests will confirm ✓ |
| Nested `mergeIfMissing()` with dot notation | Low | not used; only `$request->merge([...])` in `StoreOrderRequest` ✓ |
| Route name precedence (cached vs uncached) | Low | no duplicate route names ✓ |
| `Blueprint`/`Grammar` constructor changes (Connection) | Very low | no custom DB drivers/grammars/blueprints ✓ |
| `DatabaseTokenRepository::$expires` in seconds | Very low | no password-reset routes/tokens (Sanctum tokens only) ✓ |
| Multi-schema `Schema::getTables/getTableListing` | Low | single MySQL schema; not used ✓ |
| Concurrency result index mapping | Low | no `Concurrency::run` usage ✓ |

**Conclusion: no application code changes are expected.** Any residual
issues would surface in the contract suite (§7), and the only anticipated
repo-level edits are `composer.json`, the regenerated `composer.lock`,
an email-CRLF regression test, and doc strings that still say "Laravel 11"
(`README.md`, `backend/README.md`, `docs/DEPLOYMENT_ARCHITECTURE.md`).

## 4. Dependency delta (verified against framework v12.68.0's composer.json)

Verified by reading `laravel/framework` `v11.56.1` and `v12.68.0`
`composer.json` and comparing with `backend/composer.lock`:

**Mandatory changes:**

| Package | Change |
|---|---|
| `laravel/framework` | `v11.56.1` → `v12.68.0` (resolve `^12.61.1`) |
| `symfony/polyfill-php84` | **new requirement** of framework `^1.34`; absent from today's lock |
| (lock entry only) | framework `replace` gains `illuminate/json-schema`, `illuminate/reflection` (both `self.version`, no install impact) |

**Already satisfied by the current lock — no forced bumps:**

- `symfony/*` 7.4.17 (framework needs `^7.2.0`) · `symfony/polyfill-php83` 1.41.0 (`^1.33`) · `symfony/polyfill-php85` 1.41.0 (`^1.34`)
- `egulias/email-validator` 4.0.4 (`^3.2.1|^4.0`) · `nesbot/carbon` 3.13.2 (`^3.8.4`)
- `guzzlehttp/guzzle` 7.15.5 (`^7.8.2`) · `monolog/monolog` 3.10.0 (`^3.0`)
- `league/commonmark` 2.10.0 (`^2.8.1`) · `league/flysystem*` 3.35.3 (`^3.25.1`)
- `brick/math` 0.14.8 · `laravel/prompts` 0.3.24 (`^0.3.0`) · `vlucas/phpdotenv` 5.7.0
- `phpunit/phpunit` 11.5.56 (framework `^10.5.35|^11.5.3|^12.0.1`; root `^11.5.50`)

**Expected `composer update` additions (full refresh per project script):**

- `symfony/polyfill-php84` (latest ≈ `v1.38.1`+; must be `^1.34`)
- minor/patch point releases of dev tooling (laravel/pint 1.30.4→1.30.5-ish,
  phpunit 11.5.56→latest 11.5.x, nunomaduro/collision 8.9.5 stays, laravel/sanctum 4.3.3
  stays — sanctum 4.x declares `illuminate ^11|^12|^13` support)

Laravel 12 keeps PHP `^8.2`, so `config.platform.php = 8.2.0` and
`"php": "^8.2"` stay exactly as they are.

## 5. The change (one file)

In `backend/composer.json`:

```diff
     "require": {
         "ext-fileinfo": "*",
         "ext-pdo": "*",
-        "laravel/framework": "^11.31",
+        "laravel/framework": "^12.61.1",
         "laravel/sanctum": "^4.0",
         "league/flysystem-aws-s3-v3": "^3.29",
         "php": "^8.2"
     },
     "require-dev": {
         "fakerphp/faker": "^1.23",
-        "laravel/pint": "^1.13",
+        "laravel/pint": "^1.24",
         "mockery/mockery": "^1.6",
-        "nunomaduro/collision": "^8.1",
-        "phpunit/phpunit": "^11.0.1"
+        "nunomaduro/collision": "^8.6",
+        "phpunit/phpunit": "^11.5.50"
     },
```

(`^12.61.1` intentionally pins the *security floor* so any future
`composer update` can never drift below the patched line; the dev-tooling
constraints match the official `laravel/laravel` 12.x skeleton.)
`config.policy.advisories.block: true` stays — no advisory exemptions needed.

## 6. Execution steps

```bash
cd backend

# 1. Apply the composer.json diff above.

# 2. Regenerate the lock with the project's own resolver
#    (composer:2.8 image + config.platform.php 8.2.0 → reproducible) —
#    do NOT hand-edit composer.lock.
bash bin/refresh-composer-lock.sh            # full refresh
# or, to keep the diff minimal:
#   COMPOSER_IMAGE=composer:2.8 bash bin/refresh-composer-lock.sh laravel/framework

# 3. Prove the security goal:
composer audit --locked                        # MUST print: 0 vulnerabilities
composer validate --strict                     # lock + composer.json consistent
composer show laravel/framework                # expect v12.68.0 (>=12.61.1)

# 4. Install and run the full backend suite (same env as CI's backend-e2e job):
composer install
#    then replicate .env / MySQL 8.4 + MinIO / migrate+seed / artisan serve
#    exactly as .github/workflows/test.yml does, and run:
bash tests/e2e/smoke.sh                        # with API_URL set
php artisan test                               # ApiContractTest + any new tests
php artisan about --only=environment,drivers   # sanity: Laravel 12.x, MySQL, S3
php artisan route:list --path=api              # routes intact

# 5. Commit composer.json + composer.lock + the CRLF regression test;
#    push to main. The Test workflow then runs its full matrix
#    (backend-e2e, frontend, ui) as the final gate.
```

Rollback (if ever needed): revert the commit and redeploy. There are **no
schema migrations or runtime-format changes** introduced by this upgrade —
no new migrations ship with the framework bump, Sanctum token format is
unchanged, and queued job serialization is compatible — so rollback is a
simple app redeploy with no data migration.

## 7. Acceptance criteria

- [ ] `composer audit --locked` → no advisories
- [ ] `composer validate --strict` → clean
- [ ] `backend/bin/refresh-composer-lock.sh` run with the new constraint; lock committed
- [ ] `composer show laravel/framework` → `v12.68.0` (or later 12.x ≥ 12.61.1)
- [ ] Docker build uses the lock (no `WARNING: no composer.lock` line)
- [ ] `backend-e2e` job green: migrate + `db:seed --force` + smoke.sh + `php artisan test`
- [ ] `frontend` + `ui` jobs green (API contract unchanged; confirms no response drift)
- [ ] New CRLF regression test passes; `LoginRequest`/`SaveEmployeeRequest` still accept normal emails
- [ ] Production-like `docker compose up --build` smoke on a staging VM before main

## 8. What was verified here vs. what remains

Verified in this evaluation (source-level, using the framework/skeleton git
repos and the advisory databases):

- the three advisories, severity, exact affected ranges, and that
  `>=12.61.1` clears them;
- Laravel 11 EOL / Laravel 12 security-only window / Laravel 13 PHP 8.3 floor;
- the CRLF fix present in 12.x source (`validateEmail()` CRLF reject);
- full upgrade-guide impact scan (see §3) and full framework-12 constraint
  check against the current lock (see §4);
- release tags (12.x head = v12.68.0, published 2026-08-25).

Not executed here (sandbox limitation, not a repo problem): the actual
`composer update` / `composer install` / test run. The sandbox has **no PHP
or Composer binary, no egress to Packagist** (`repo.packagist.org` /
`getcomposer.org` are firewalled), and the GitHub token in this session
cannot create or dispatch GitHub Actions workflows (no `workflows` /
`actions:write` scopes). Consequently the composer.json/lock change was
deliberately **not** committed to the branch — committing the constraint
without a regenerated lock would break `composer install` for anyone.
Execute §6 when next at the repo; the command set is exactly the project's
own documented flow.

## 9. Follow-ups worth scheduling

1. **Laravel 13 (before 2027-02-24):** requires PHP `^8.3`. Plan: bump
   `"php": "^8.3"` + `config.platform.php` to `8.3.0` (CI is already 8.3;
   runtime 8.4 — both fine), then a same-shaped upgrade; the 12→13 guide is
   similar in size.
2. **Add `composer audit --locked` as a non-blocking CI step** in `.github/workflows/test.yml`
   (as `backend/README.md` already suggests). Needs a human with
   `workflows`/`actions` write access — the automated token here can't edit
   or run workflows.
3. **Docs drift:** `backend/README.md:3`, root `README.md:10`, and
   `docs/DEPLOYMENT_ARCHITECTURE.md` still say Laravel 11; `backend/README.md`
   dependency section also still says `policy.advisories.block: false`
   although e299060 restored `true`. Update alongside the upgrade.
4. **Optional:** enable GitHub Dependabot for Composer in the backend (and
   npm for apps) so advisories surface as PRs instead of manual `composer audit`.

## 10. Decision summary

| Question | Answer |
|---|---|
| Is upgrade needed? | Yes — Laravel 11 is EOL; 3 advisories incl. 1 high against the locked version; `composer update` is currently blocked project-wide |
| Target? | `laravel/framework ^12.61.1` → resolves **v12.68.0**; PHP `^8.2` unchanged |
| Why not 13? | Requires PHP `^8.3`; 13 is a bigger change. 12 buys runway (security until 2027-02-24) for a planned 13.x step |
| Code changes? | None expected — verified against the upgrade guide and the framework's actual dependency constraints |
| Risk of lock refresh? | Low-moderate: framework + one new polyfill mandatory; dev-tooling point releases; all constraints already satisfied |
| When? | Soon, but not emergency-burning: no live exploit path in this app. Realistically the next backend sprint; schedule the 13.x step before Feb 2027 |
