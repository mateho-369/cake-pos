# Cake POS

Phase 1 of a professional point-of-sale system for a fresh-cake shop. The repository currently contains the **Admin Control** frontend prototype: a responsive React + TypeScript + Vite application with operational dashboard, sales, catalog, FEFO freshness controls, waste tracking, team access, shifts, reports, and settings.

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

## Run the Admin Control app

```bash
npm install
npm run dev
```

The Vite server binds to `0.0.0.0:4173`. Development mode opens the operational prototype with fixture data. Production builds show the real admin login unless `VITE_DEMO_MODE=true` is intentionally supplied.

```bash
cp apps/admin/.env.example apps/admin/.env.local
npm run build
```

Set the production value at build time:

```env
VITE_API_URL=https://api.yourdomain.com
VITE_DEMO_MODE=false
```

The Admin Worker Static Assets configuration is in `apps/admin/wrangler.jsonc`. After the build-time variables are set, deploy it independently with:

```bash
npm run deploy:admin
```

Attach `admin.yourdomain.com` to this Worker in Cloudflare. The future sale frontend must use a different Worker and route for `sale.yourdomain.com`.

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
  admin/                 React admin frontend
    public/              Product photography asset
    src/
      auth/              In-memory Bearer auth state
      components/        Shell and modal components
      lib/api.ts          Cross-origin API client
      pages/              Admin feature areas
docs/
  DEPLOYMENT_ARCHITECTURE.md
  POS_RESEARCH.md
```

The sale terminal and Laravel API remain separate deliverables. The backend is not implemented in this phase, in accordance with the project blueprint.
