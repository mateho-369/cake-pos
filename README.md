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
   _reserved_, not sold, so the shelf count is never double-sold while it waits.
   Many orders can be held at once.
3. When the customer comes back: **Take payment** pays the hold directly, or
   **Resume** puts its lines back into the cart — the hold stays parked until
   the sale is paid, so nothing is lost if the cart is cleared.
4. The moment the sale is paid, the hold is closed in the same transaction:
   it leaves the panel, its reservation is freed, and the audit trail records
   `order.hold_released` with the paid order's id. The old order keeps a
   `Cancelled` status so revenue is never double-counted, but its status event
   carries `reason: hold_paid` + the paid order id, so the admin Orders page
   shows **Converted → CS-…** (linked) instead of a misleading cancellation.
   **Discard** genuinely cancels a hold and returns its stock.

Holding is shift-gated like every other sale endpoint (`POST /api/orders/hold`,
`GET /api/orders/held`). A released hold is never counted as revenue — only the
paid order is (status `Completed` + `payment_status = paid`).

## Cancelling a pending customer order — two doors, one lock

A Telegram order that the seller has not accepted yet can be called off from
either side, and both paths end identically (order `Cancelled`, reserved
stock released, customer notified by the shop bot, event in the audit trail):

- **Customer self-cancel** — `POST /api/customer-orders/{id}/cancel` from the
  Mini App, audited as `customer_order.cancelled` with `source: customer`.
- **Staff reject** — `POST /api/orders/{id}/reject` from the sale terminal's
  pending queue, for when the cashier rings the customer and learns they
  never placed the order. Audited as `customer_order.rejected` with
  `source: staff`, the acting employee, and the optional reason (the reason
  is never sent to the customer).

Both take a row lock and re-read the status inside the transaction, so the
two can never double-process one order: whoever lands first wins and the
other side gets a plain 409 (`This order has already been cancelled` /
`This order was already cancelled — the customer cancelled it first`) instead
of a crash or a second stock release. Once the order has been **accepted**,
`/reject` is refused — it is an ordinary hold at that point and goes through
`POST /api/orders/{id}/cancel`.

## Telegram order payment integrity

Telegram customer orders are completed ONLY through the real Take Payment flow
(`POST /api/orders/{id}/pay`), which creates an `order_payments` row with the
actual method, amount, and cash tender/change. The old admin "Order status"
dropdown can no longer set `Paid` or `Completed` — those are status-only
changes that previously stamped `KHQR` with no payment row and silently hid the
sale from cash reports and shift reconciliation.

To audit the legacy damage on a store, run:

```bash
php artisan audit:telegram-payments --list
```

It reports Completed/Paid Telegram orders that have no `OrderPayment` and
their total value. It does NOT backfill anything — a real method/tender for
each historical sale must come from the owner's own records. `Paid` legacy
rows can still be recovered with a real Take Payment (no payment row exists
and the old `Paid` branch never sold the stock), but `Completed` legacy rows
are report-only because the old branch already decremented stock and counted
product revenue — re-paying one would double-sell.

## Categories

Category names are never hardcoded in any UI. Every picker (sale Quick Add,
admin Quick Add, catalog filters, the shop) is built from the live
`GET /api/categories` list, so a store with its own taxonomy works unchanged.

**Quick Add** asks the cashier to pick a category — there is no default, and
**Add & publish** stays disabled until one is chosen (this fixed the old
`unknown category: Signature` rejection, which happened whenever a store had no
product in a category named "Signature"). If the category does not exist yet,
type it in the "new category" field and tap **+** : it is created, selected, and
the cake you already typed (name, price, photo) is kept. Typing a name that
already exists selects the existing category instead of making a duplicate, and
a near-match shows a "did you mean" hint. When a store has no categories at all
the picker says so and offers the create field right there — never a blank gap.

**Cashier-proposed categories.** The owner is not always at the counter, so any
logged-in employee can create a category ("boss says add a Seasonal category for
this"). It is created **active and usable immediately** — the sale is never
blocked waiting for approval — but a cashier-made category is flagged
`pendingReview`, records who proposed it, and nudges the owner on Telegram.

**Owner review** happens in Admin > Categories, in a "Needs your review" panel
at the top:

- **Approve** — clears the flag; the category becomes an ordinary one.
- **Reject** — deactivates it, but is refused with a 422 while any active
  product still uses it (`N active product(s) still use this category`), so no
  product is ever left pointing at a dead category.

Placing a category under a parent is a taxonomy decision and stays admin-only: a
cashier sending `parentCategoryId` gets a 422 (`Only an admin can place a
category under a parent`) rather than being silently granted or silently
stripped of hierarchy control. Everything is audited as
`category.created_by_cashier`, `category.approved`, `category.rejected`.

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
