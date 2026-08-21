# Laravel + MySQL deployment architecture

```text
admin.yourdomain.com ─┐
sale.yourdomain.com  ─┼─ HTTPS + Sanctum Bearer token ─ api.yourdomain.com
shop under sale origin ┘                                  │
                                                         VM / Docker Compose
                                                         ├─ nginx
                                                         ├─ PHP 8.3 FPM / Laravel 11
                                                         └─ MySQL 8.4 volume
```

The admin and sale builds are static frontends. The shop is independently built but should be routed beneath the sale origin when using the required exact two-origin CORS policy. Staff sale authentication stays PIN/email based; only the shop verifies Telegram `initData` as identity.

## VM deployment

```bash
cd backend
cp .env.example .env
# Configure APP_KEY, MySQL, ADMIN_ORIGIN, SALE_ORIGIN, staff seeds, Telegram.
docker compose build
docker compose --profile tools run --rm migrate
docker compose up -d app web
curl http://127.0.0.1:8080/healthz
```

The multi-stage image resolves Composer dependencies in a build stage. The lean PHP-FPM runtime installs only required PHP extensions. During the image build, `find` discovers the actual `www.conf`; the build then sets and verifies `clear_env = no`, ensuring Docker-injected Laravel and MySQL variables reach PHP workers.

MySQL is not published to the host. Its InnoDB buffer pool and connection count are constrained for a 1GB VM. nginx, PHP-FPM, and MySQL have explicit memory limits.

The migration service intentionally uses:

```yaml
entrypoint: ["/bin/sh", "-lc"]
command:
  - >-
    php artisan migrate --force && php artisan db:seed --force
```

This preserves argument splitting and avoids the plain multi-line Compose command failure mode.

## CORS and auth

Laravel CORS allows exactly `ADMIN_ORIGIN` and `SALE_ORIGIN`, methods `GET, POST, PUT, PATCH, DELETE, OPTIONS`, and headers `Accept, Authorization, Content-Type`. Wildcards and cookie credentials are disabled.

Staff login returns a 12-hour Sanctum token. Stock-changing sales run in a MySQL transaction and lock product rows with `SELECT ... FOR UPDATE`, so any validation/stock failure rolls back the entire order.
