# Cake POS

Phase 1 of a professional point-of-sale system for a fresh-cake shop. The repository contains two independent React + TypeScript + Vite frontends: **Admin Control** for owner operations and **Sale Terminal** for employee checkout. Both share the same cross-origin API convention and in-memory Bearer-token authentication pattern.

## Applications and production origins

The production system is intentionally split across three origins:

| Application | Production origin | Hosting |
|---|---|---|
| Sale terminal | `https://sale.yourdomain.com` | Cloudflare Workers Static Assets |
| Admin control | `https://admin.yourdomain.com` | Cloudflare Workers Static Assets |
| Shared Laravel API | `https://api.yourdomain.com` | Dedicated GCP VM / Docker Compose |

These are **different browser origins**. Frontends must never assume that `/api` on their own host reaches Laravel.

## Authentication contract

Authentication uses Laravel Sanctum **personal access / API Bearer tokens**, not cookie sessions.

1. Frontend posts credentials to `${VITE_API_URL}/api/login`.
2. API returns `{ "token": "...", "employee": { ... } }`.
3. The frontend keeps the token in React/in-memory state only.
4. `src/lib/api.ts` adds `Authorization: Bearer <token>` to every authenticated request.
5. Signing out clears both React state and the in-memory API client token.
6. Refreshing the page clears the token and requires a new login. Tokens are intentionally not persisted to `localStorage`.

No frontend uses Laravel's cookie-based SPA authentication and no Telegram identity is used to authenticate staff.

## CORS contract

Laravel must answer preflight `OPTIONS` requests and return:

```http
Access-Control-Allow-Origin: https://admin.yourdomain.com
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Accept, Authorization, Content-Type
Vary: Origin
```

The API may echo only one of these exact allowlisted origins:

- `https://sale.yourdomain.com`
- `https://admin.yourdomain.com`

`supports_credentials` should remain `false` because authentication does not use cookies. Cloudflare must bypass cache for every `api.yourdomain.com/api/*` response.

A suitable Laravel `config/cors.php` policy is documented in [`docs/DEPLOYMENT_ARCHITECTURE.md`](docs/DEPLOYMENT_ARCHITECTURE.md).

## Run the frontends

```bash
npm install
npm run dev:admin   # Admin Control on 0.0.0.0:4173
npm run dev:sale    # Sale Terminal on 0.0.0.0:4174
```

The Sale Terminal always opens on its normal PIN/email login screen, including in Telegram. Development fixture mode accepts PIN `1234`; production sends the PIN or email credentials to the shared login endpoint and stores the returned Bearer token in memory.

```bash
cp apps/admin/.env.example apps/admin/.env.local
cp apps/sale/.env.example apps/sale/.env.local
npm run build
```

Set the production value at build time:

```env
VITE_API_URL=https://api.yourdomain.com
VITE_DEMO_MODE=false
```

Each frontend has an independent Cloudflare Worker Static Assets configuration:

```bash
npm run deploy:admin   # apps/admin/wrangler.jsonc → admin.yourdomain.com
npm run deploy:sale    # apps/sale/wrangler.jsonc  → sale.yourdomain.com
```

Attach each custom domain to its corresponding Worker in Cloudflare. They are separate deployments and must not be combined into one origin.

## Sale Terminal feature coverage

- Mandatory staff login with a large 4-digit glass PIN pad and email/password fallback
- Responsive category/product menu with photo cards, large touch targets, stock visibility, and FEFO near-expiry highlighting
- Persistent tablet/desktop cart and phone bottom sheet with quantity steppers, line totals, removal, and running total
- Cash tender/change workflow and static KHQR manual-confirmation workflow
- Full-screen auto-dismissing payment success state
- Opening-float and closing-count shift workflows with expected-versus-actual variance
- Photo-first Quick Add Cake sheet with Name, Price, Category, and automatic 2–3 day best-before handling
- Telegram Web App SDK initialization using `ready()` and `expand()` only; Telegram identity and `initData` are never used for staff authentication
- Independent Cloudflare Worker Static Assets deployment for `sale.yourdomain.com`

## Admin Control feature coverage

- Owner dashboard with net sales, order pace, average order, freshness risk, payment split, top sellers, live orders, and current-shift pulse
- Product catalog with search, operational filters, table/grid views, quick editing, stock, pricing, freshness, and sale availability
- Photo-first “Add Cake” flow with camera capture, price/category/stock fields, and automatic best-before date
- Sales ledger with receipt detail, KHQR/cash markers, export, refund entry point, and manual KHQR confirmation audit
- FEFO freshness queue, production batches, expiry risk value, waste reasons, and waste log
- Categories with sale-terminal ordering and contribution insight
- Admin-created employee accounts, PIN setup, role matrix, access activity, and no public signup
- Shift timing, opening float, expected cash, physical count, variance, KHQR reconciliation, and immutable history
- Sales, margin, category, product, payment, team, and waste reporting surfaces
- Business, currency, KHQR, receipt, freshness, security, and separate-origin API settings
- Responsive desktop/tablet/mobile layouts, keyboard command palette (`⌘/Ctrl + K`), CSV exports, modals, and visible action feedback

The interface deliberately uses restrained blush glass surfaces and a dark plum information hierarchy. Pink is an accent—not the entire UI—so the result reads as a professional operations console rather than a decorative or child-oriented dashboard.

## Repository layout

```text
apps/
  admin/                 Owner Admin Control frontend
    src/auth/            In-memory Bearer auth state
    src/lib/api.ts       Cross-origin API client
    src/pages/           Admin feature areas
  sale/                  Employee Sale Terminal frontend
    src/auth/            Same in-memory Bearer auth pattern
    src/lib/api.ts       Same cross-origin API client shape
    src/components/      Login, menu, cart, shifts, checkout
    wrangler.jsonc       Separate sale Worker deployment
docs/
  DEPLOYMENT_ARCHITECTURE.md
  POS_RESEARCH.md
```

Both Phase 1 frontends are now present. The Laravel API remains a separate deliverable and is not implemented in this phase, in accordance with the project blueprint.
