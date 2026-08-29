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

## Stale content prevention (deployed stale UI + stale shift)

A deploy can leave the terminal showing yesterday's UI even though the new
source is in the repo. Three independent caches can cause it, and this
changeset addresses all of them together:

1. **Browser / edge HTML cache.** Each static frontend ships a
   `public/_headers` file (copied into the deployed Cloudflare Workers
   asset bundle) that forces the HTML entry point to revalidate
   (`Cache-Control: no-cache`) while letting Vite's fingerprinted
   `/assets/*` live until the hash changes
   (`public, max-age=31536000, immutable`). Without it, a cached
   `index.html` continues pointing at the previous asset hash and the
   cashier keeps seeing the old POS UI.

2. **API worklet edge cache.** The `api-proxy` Worker re-asserts
   `Cache-Control: no-store` on every response. The backend already sends
   `no-store` on the shift/current endpoints, but if an older backend
   image is still running the proxy now guarantees the deployed UI can
   never display a stale shift badge or stale customer-order list.

3. **PHP/FPM caches.** Production uses OPcache with
   `opcache.validate_timestamps=0` plus cached Laravel config/routes/views.
   The backend cannot be updated through this branch because the GitHub
   App token lacks `workflows` permission, so the exact workflow edits are
   preserved in `docs/patches/deploy-backend-cache-opcache.patch`
   (`--force-recreate` + the three `*:cache` commands). Until a maintainer
   applies it, run `backend/bin/post-deploy.sh` after every deploy. The
   frontend deploy picks up `_headers` automatically because it rebuilds
   and re-uploads the `dist/` assets.

4. **No CI shift lifecycle against production.** The live-prod probe is now
   strictly read-only: it never opens or closes a shift, even if
   `LIVE_PROD_SHIFT_LIFECYCLE=1` is set, and the workflow pins it to `"0"`.
   A shift may only close through the explicit admin/sale "Close shift"
   action. A background probe closing the shop's only open shift was the
   "shift closed by itself" mechanism; it also flipped `storeOpen` to false,
   so Telegram customers suddenly saw the shop closed and could not order.
   The `.github/workflows/test.yml` edit cannot be pushed by the GitHub App
   (it lacks `workflows` permission), so it is preserved in
   `docs/patches/live-prod-readonly.patch` — apply it, or just rely on the
   read-only probe script itself, which forces `LIVE_PROD_SHIFT_LIFECYCLE=0`
   regardless of the workflow env.
