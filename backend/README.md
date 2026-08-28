# Cake POS Laravel API

Laravel 11, Eloquent, Sanctum bearer tokens, and MySQL 8. HTTP validation lives in `app/Http/Requests`, camelCase serialization in `app/Http/Resources`, and transactional POS rules in `app/Services`; controllers only coordinate those layers. The API preserves the frontend contract from the former service.

## Local/deployment setup

```bash
cp .env.example .env
# Edit every secret and origin, then generate an APP_KEY:
docker compose run --rm app php artisan key:generate --show

docker compose build
# The Dockerfile prints and verifies the discovered php-fpm www.conf path and clear_env=no.
docker compose --profile tools run --rm migrate
docker compose up -d app web
curl http://localhost:8080/healthz
```

The one-shot `migrate` and `minio-init` services use explicit shell entrypoints and YAML lists containing one folded-scalar command. `minio-init` creates the bucket, grants anonymous downloads only below `product-images/`, and applies browser CORS rules. Neither MySQL nor MinIO is exposed beyond `127.0.0.1`; reverse-proxy the configured `AWS_PUBLIC_ENDPOINT` to MinIO's local port while preserving the request host for S3 signatures.

Laravel signs direct browser PUTs through `/api/uploads/presign`, then `/api/uploads/complete` reads the stored bytes through the internal MinIO endpoint and verifies size plus MIME magic before the URL may be persisted. The backend app, MinIO server, and init job all read the same `backend/.env`; there is no second credential file to drift out of sync.

## Dependency management and Composer advisory policy

Dependencies are pinned by `composer.lock`, and the Docker build stage copies
`composer.*` so the image is built with `composer install` **from the lock** —
no dependency resolution at deploy time. That matters for two reasons:

1. **Reproducibility.** The same commit always produces the same vendor tree.
2. **Deploy stability.** Composer's advisory blocking (on by default since
   Composer 2.9) only rejects packages *while resolving* — during
   `update`/`require`/`remove`, and during `install` when there is no lock file.
   Installing from a committed lock never resolves, so a newly published
   advisory against an already-pinned package can no longer break a deploy.

Never hand-edit the lock. Regenerate it with:

```bash
backend/bin/refresh-composer-lock.sh                    # refresh everything
backend/bin/refresh-composer-lock.sh laravel/framework  # bump one package
```

Run the same script once to create `backend/composer.lock` if it is not present
yet — until it is committed, the build stage falls back to resolving latest
versions and prints a `WARNING: no composer.lock` line in the build log.

The script resolves inside the same `composer:2.8` image the `vendor` build
stage uses, and `config.platform.php` in `composer.json` pins resolution to the
declared floor (PHP 8.2). Together those keep the lock identical no matter which
PHP a developer, CI (8.3) or the runtime image (8.4) happens to have — without
the pin, a lock resolved on 8.4 can select packages the 8.3 build image then
refuses to install.

`composer.json` currently sets `config.policy.advisories.block: false`. That was
an emergency unblock to get deploys moving while there was no lock file, and it
is the wrong long-term setting: it disables the warning everywhere, including at
the one moment you actually want it. Once the lock is committed, restore the
default (`true`) so that:

- `composer update` still refuses to pull in a vulnerable version — you find out
  when you can act on it;
- deploys keep working regardless, because they install from the lock;
- anything you consciously accept is recorded as a scoped, documented exception
  via `config.policy.advisories.ignore-id` (each entry takes a `reason`) rather
  than by switching the whole feature off.

`refresh-composer-lock.sh` runs `composer audit --locked` after resolving, which
reports advisories affecting the pinned versions without failing the refresh.
Wiring the same `composer audit --locked` into CI as a non-blocking step gives
continuous visibility into advisories that land after the lock was written.

## Environment

All variables are documented in `.env.example`. Telegram staff notifications and customer broadcasts use the configured bot tokens and database queue. Run `php artisan queue:work` in production. Before staff notifications can arrive, the owner must send `/start` to the staff bot in the target DM, or add the bot to the target group. CORS is allowlist-only and accepts `ADMIN_ORIGIN`, `SALE_ORIGIN`, and `SHOP_ORIGIN`, including `Authorization` and `Content-Type` headers. Each separately hosted app must be configured with its own exact HTTPS origin.

## API authentication

`POST /api/login` accepts either email/password or `pin_code`. It returns a 12-hour Sanctum personal access token. Staff routes use `auth:sanctum`; administrative mutations additionally use the `admin` middleware. Telegram customer routes remain separate and validate Telegram `initData` using the official two-stage HMAC-SHA256 algorithm.

## Integrity and security contract tests

Against a disposable MySQL database:

```bash
php artisan test --filter ApiContractTest
```

`tests/Feature/ApiContractTest.php` explicitly verifies the five-attempt login limiter and Retry-After response; 12-hour Sanctum expiry and token deletion on logout; integer-cent schemas and exact cent arithmetic; percentage/fixed discount caps and non-negative totals; idempotent duplicate submission; generated `FOR UPDATE` SQL and rollback; immutable completed orders plus linked corrections; cent-based shift variance; Telegram signature rejection/acceptance; and reports camelCase output.

## POS integrity guarantees

- Login is limited to five attempts per IP per minute and returns HTTP 429 with `Retry-After`.
- Currency is persisted as integer cents. Percentage discounts use integer basis points.
- The server recomputes subtotal from locked product rows and enforces the configured cashier discount ceiling.
- A unique UUID idempotency key makes retries return the original order without a second stock decrement.
- Completed orders cannot be updated. Refunds and voids are separate linked negative records.
- Sanctum tokens expire after 12 hours and `/api/logout` deletes the active token.

## Main routes

The Laravel service preserves all routes consumed by `apps/admin`, `apps/sale`, and the customer storefront, including products/import, categories, orders and Telegram statuses, employees, shifts, reports, customers, receipt settings/reprints, Telegram contact webhook, and customer orders.
