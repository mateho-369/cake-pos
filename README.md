# Bloom POS

Point of sale for a cake shop that bakes fresh every 2–3 days. Liquid Glass pink, iPad-first, PIN login, KHQR by cashier confirm.

Three **separate origins** in production. No cookies, no Sanctum SPA sessions.

| Host | App |
|---|---|
| `sale.yourdomain.com` | Sale terminal |
| `admin.yourdomain.com` | Admin control |
| `api.yourdomain.com` | Shared API (Laravel later; mock API today) |

Auth is a **Bearer token** in `Authorization`, returned on login, held in React state (memory only — refresh signs you out), attached to every API call. Each frontend reads `VITE_API_URL` at build time. The API sends CORS for the two frontend origins and allows the `Authorization` header.

## Demo logins

| Role | How |
|---|---|
| Cashier Dara | PIN `2468` on the sale app |
| Cashier Malis | PIN `1357` |
| Owner Sophea | `owner@bloom.bakery` / `bloom1234` on the **admin** app |

Telegram Mini App (sale only): `ready()` + `expand()`. Never `initData` for auth.

## Local

```bash
npm install
npm run dev:api      # mock API on :8080
npm run dev:sale     # sale terminal on :5173  (proxies /api → :8080)
npm run dev:admin    # admin control on :5174
```

Leave `VITE_API_URL` unset locally so the browser calls same-origin `/api` (Vite proxy). Do not point the client at `http://127.0.0.1:8080` — preview browsers are not the sandbox.

Production builds:

```bash
VITE_API_URL=https://api.yourdomain.com/api npm run build:sale
VITE_API_URL=https://api.yourdomain.com/api npm run build:admin
npx wrangler deploy -c wrangler.sale.jsonc
npx wrangler deploy -c wrangler.admin.jsonc
```

## Why not cookies

Sale, admin, and API are different subdomains. Cookie + SameSite + CORS across those origins is the class of bug that ate hours on the portfolio project (419 CSRF, unreadable `XSRF-TOKEN`). Bearer tokens skip all of that.

## What is deliberately not here

- Laravel 12 — write when requested; the mock API is the contract
- Customer self-order storefront (Phase 2)
- Realtime Bakong KHQR — MVP is static QR + cashier confirm
