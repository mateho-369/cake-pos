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

## Environment

All variables are documented in `.env.example`. CORS is allowlist-only and accepts `ADMIN_ORIGIN`, `SALE_ORIGIN`, and `SHOP_ORIGIN`, including `Authorization` and `Content-Type` headers. Each separately hosted app must be configured with its own exact HTTPS origin.

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
