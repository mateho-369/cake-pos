# Bloom POS

Point of sale for a cake shop that bakes fresh every 2–3 days. Liquid Glass pink, iPad-first, PIN login, KHQR by cashier confirm.

Phase 1 is the **Sale Terminal** and **Admin Control**. There is no public signup, no customer storefront, and no Laravel backend yet (that lands when asked). Data lives in `localStorage` so you can ring up real tickets today.

## Apps

| App | Route | Who |
|---|---|---|
| Sale Terminal | `/` | Cashiers — PIN pad, product grid, cart, cash / KHQR |
| Admin Control | `/admin` | Owner — dashboard, products, employees, shifts, reports |

Same origin in this preview so mock data is shared. Production can split into two Cloudflare Workers in front of the same Laravel API.

## Stack (same as Field Notes / portfolio)

React 19 · TypeScript · Vite 7 · Tailwind 4 · Cloudflare Workers (`worker/index.js` same-origin proxy) · MinIO · Aiven MySQL · a **new** GCP VM, not the portfolio one.

## Demo logins

| Role | How |
|---|---|
| Cashier Dara | PIN `2468` |
| Cashier Malis | PIN `1357` |
| Owner Sophea | `owner@bloom.bakery` / `bloom1234` (Admin Control, or email tab on the terminal) |

Telegram Mini App: the terminal loads `telegram-web-app.js` and calls `ready()` + `expand()`. It never reads `initData` for auth.

## Local

```bash
npm install
npm run dev
```

Optional data services (MySQL + MinIO, for when Laravel arrives):

```bash
docker compose up -d
```

## Design

Blush wash `#FDF2F6`, frosted glass, pink `#F472B6` / `#BE185D`, signature blue `#3B82F6` horizon line, ink `#3B0A1F`, Poppins, 20–28px corners. Cakes near `best_before` glow coral so cashiers sell them first.

## What is deliberately not here

- Laravel 12 + Sanctum — write when requested
- Customer self-order storefront / Telegram identity for customers (Phase 2)
- Realtime Bakong KHQR — MVP is static QR + cashier confirm
