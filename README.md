# Cake POS

Cake POS has three focused React frontends and a self-hosted Laravel API:

| Folder       | Purpose                                                | Local | Production                  | Setup                          |
| ------------ | ------------------------------------------------------ | ----: | --------------------------- | ------------------------------ |
| `apps/admin` | Owner operations, inventory, customers, reports        |  4173 | `admin.yourdomain.com`      | [README](apps/admin/README.md) |
| `apps/sale`  | Staff checkout; PIN/email login even inside Telegram   |  4174 | `sale.yourdomain.com`       | [README](apps/sale/README.md)  |
| `apps/shop`  | Customer Telegram Mini App; verified Telegram identity |  4175 | `sale.yourdomain.com/shop/` | [README](apps/shop/README.md)  |
| `backend`    | Laravel 11 + Sanctum + MySQL REST API                  |  8080 | `api.yourdomain.com`        | [README](backend/README.md)    |
| `packages`   | Shared API client and Liquid Glass design tokens       |     — | bundled into frontends      | source-only workspaces         |

`apps/sale` and `apps/shop` can both be opened from the Telegram bot. The shared `@cake-pos/telegram` package makes **every** Mini App surface open edge-to-edge: `ready()` → `expand()` → `requestFullscreen()` on Web App API 8.0+, with one retry after the first tap because iOS clients reject a programmatic request before any user gesture. Telegram remains only a shell: staff authentication is always PIN or email/password, and `apps/shop` keeps deliberately separate code, using signed Telegram `initData` as customer identity with no customer login screen.

## Held (parked) orders

A customer can order now and pay on collection. On the sale terminal:

1. Add the items to the cart and tap **Hold order** — optionally name it
   ("Dara — 4pm") so it can be told apart from the other holds.
2. The ticket shows up in the **Held orders** panel, oldest first. Its stock is
   *reserved*, not sold, so the shelf count is never double-sold while it waits.
   Many orders can be held at once.
3. When the customer comes back: **Take payment** pays the hold directly, or
   **Resume** puts its lines back into the cart — the hold stays parked until
   the sale is paid, so nothing is lost if the cart is cleared.
4. The moment the sale is paid, the hold is released in the same transaction:
   it leaves the panel, its reservation is freed, and the audit trail records
   `order.hold_released` with the paid order's id. **Discard** cancels a hold
   and returns its stock.

Holding is shift-gated like every other sale endpoint (`POST /api/orders/hold`,
`GET /api/orders/held`). A released hold is never counted as revenue — only the
paid order is (status `Completed` + `payment_status = paid`).

## Frontends

```bash
npm install
npm run dev:admin
npm run dev:sale
npm run dev:shop
```

During Vite development, `/api` proxies to port 8080. In production, set `VITE_API_URL` in each frontend environment. Build and check all apps with:

```bash
npm run typecheck
npm run build
```

## Laravel API and MySQL

```bash
cd backend
cp .env.example .env
# Fill APP_KEY, MySQL credentials, exact CORS origins, seed credentials,
# and Telegram settings.
docker compose build
docker compose --profile tools run --rm migrate
docker compose up -d app web
curl http://127.0.0.1:8080/healthz
```

The backend uses Eloquent migrations, MySQL transactions, pessimistic stock locks, integer-cent money arithmetic, idempotent checkout, immutable completed orders, and 12-hour Sanctum personal access tokens revoked on logout. It preserves the camelCase JSON contract expected by both existing staff frontends. See [`backend/README.md`](backend/README.md) for deployment and contract-test details.

## Authentication boundaries

- Staff: `POST /api/login` with `{ email, password }` or `{ pin_code }`, followed by `Authorization: Bearer <Sanctum token>`.
- Customer shop: signed Telegram `initData`, verified server-side with the bot token.
- No staff authentication module is shared with the customer shop.

## CORS

The backend accepts exactly `ADMIN_ORIGIN` and `SALE_ORIGIN`, never `*`, and permits `Accept`, `Authorization`, and `Content-Type`. Host the shop under the sale origin through the same edge/reverse proxy when retaining this strict two-origin deployment policy.
