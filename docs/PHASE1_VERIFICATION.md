# Cake POS verification

Verified against the current repository implementation.

## Deployment and repository architecture

| Requirement | Status | Repository evidence |
|---|---|---|
| One repository | Pass | Root workspace contains both frontends and `backend/` |
| Sale frontend is independent | Pass | `apps/sale`, package `@cake-pos/sale` |
| Admin frontend is independent | Pass | `apps/admin`, package `@cake-pos/admin` |
| Shared API is a third origin | Pass | `VITE_API_URL` production configuration and Vite local proxy |
| Self-hosted VM backend | Pass | `backend/Dockerfile`, `backend/docker-compose.yml`, persistent data volume |
| Environment visibility check | Pass in Node; Compose command provided | `backend/scripts/check-env.js`; run with `docker compose exec api ...` on the VM |

## Authentication and CORS

| Requirement | Status | Verification |
|---|---|---|
| Bearer token, not cookie session | Pass | Both API clients set `Authorization: Bearer <token>` |
| Session persistence within a tab | Pass | Both `AuthContext` implementations initialize from and write to `sessionStorage` |
| PIN and email login use one endpoint | Pass | `POST /api/login` accepts `{ pin_code }` or `{ email, password }` |
| No public signup | Pass | Employee POST/PUT/DELETE routes require admin role |
| Exact CORS origin allowlist | Pass | `ADMIN_ORIGIN` and `SALE_ORIGIN`; no wildcard |
| Authorization preflight | Pass | Global OPTIONS middleware allows Authorization and Content-Type |

## Backend routes

- Products: GET/POST and PUT/DELETE by id, with server-computed freshness status.
- Categories: GET/POST and PUT/DELETE by id.
- Orders: GET/POST; POST validates stock and atomically updates stock, sold, revenue, order, and order items.
- Employees: GET/POST and PUT/DELETE by id, admin-only.
- Shifts: open, close, list; close returns expected cash, closing cash, and variance.
- Reports: today's sales/order totals, seven-day revenue series, and top products.

## Frontend data source

The former mock arrays in `apps/admin/src/data.ts` and `apps/sale/src/data.ts` are now type definitions only. Runtime data is loaded through authenticated `apiRequest()` calls in:

- `apps/admin/src/lib/data.tsx`
- `apps/sale/src/lib/data.tsx`

Admin pages consume the admin data provider. Sale products, categories, orders, Quick Add, and shifts consume the sale data provider. The existing UI-facing TypeScript shapes remain intact.

## Verification commands

```bash
npm run typecheck
npm run build
node --check backend/src/server.js
node --check backend/src/db.js
```

A local smoke test should start the backend with explicit environment values, check `/healthz`, log in with the seeded cashier/admin credentials, test CORS preflight, create an order, and confirm product stock changed. Docker was not available in the coding sandbox; the container-side environment check is included and should be run with `docker compose exec api node scripts/check-env.js` on the Linux VM.
