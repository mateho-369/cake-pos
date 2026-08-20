# Phase 1 verification

Verified on 2026-08-20 against the Cake POS blueprint.

## Deployment and repository architecture

| Requirement | Status | Repository evidence |
|---|---|---|
| One repository | Pass | Root npm workspaces manage both frontends |
| Sale frontend is independent | Pass | `apps/sale`, package `@cake-pos/sale` |
| Admin frontend is independent | Pass | `apps/admin`, package `@cake-pos/admin` |
| Separate Cloudflare projects | Pass | `cake-pos-sale` and `cake-pos-admin` in separate `wrangler.jsonc` files |
| Shared API is a third origin | Pass in frontend/docs | Both builds use `VITE_API_URL=https://api.yourdomain.com` |
| Laravel backend on VM | Intentionally pending | Blueprint says not to implement Laravel until explicitly requested |

The folder names use the existing workspace convention requested during implementation:

```text
apps/sale  = sale-frontend
apps/admin = admin-frontend
backend    = future Laravel application
```

This is logically the same three-project monorepo. Renaming the two completed applications is not required for separate domains or deployments and would only invalidate established paths.

## Authentication and cross-origin API

| Requirement | Status | Verification |
|---|---|---|
| Bearer token, not cookie session | Pass | Both API clients set `Authorization: Bearer <token>` |
| Token held in React/in-memory state | Pass | Both `AuthContext` implementations use `useState`; API clients hold a module-memory token |
| No browser token persistence | Pass | No `localStorage`, `sessionStorage`, cookie, or IndexedDB token code |
| Same API client shape | Pass | Sale copied Admin's base URL, request headers, fetch wrapper, response handling, and errors; PIN login is the only added auth call |
| Build-time API URL | Pass | Both apps read `import.meta.env.VITE_API_URL` |
| PIN and email login use same endpoint | Pass | Both call `POST /api/login` and expect `{ token, employee }` |
| Exact CORS origin allowlist | Ready for backend | `sale.yourdomain.com` and `admin.yourdomain.com` are documented in `DEPLOYMENT_ARCHITECTURE.md` |
| Authorization preflight | Ready for backend | Required headers and `OPTIONS` verification command are documented |

The backend must enforce CORS and authorization when implemented; frontend code cannot provide API response headers.

## Sale Terminal

- Pass: normal PIN/email login appears in browser and Telegram.
- Pass: Telegram SDK is loaded from `https://telegram.org/js/telegram-web-app.js`.
- Pass: `Telegram.WebApp.ready()` and `expand()` run on mount.
- Pass: there is no `initData` access or Telegram staff identity authentication.
- Pass: opening cash is required before products can be sold.
- Pass: closing cash shows expected-versus-actual variance.
- Pass: category grid, search, large product cards, FEFO warning glow, and stock count.
- Pass: desktop/tablet side cart and phone bottom-sheet cart.
- Pass: quantity adjustment, line removal, clear cart, subtotal, total, and stock reduction.
- Pass: cash tender/change and KHQR manual confirmation.
- Pass: auto-dismissing payment success overlay.
- Pass: photo-first Quick Add Cake with Name, Price, Category, and 2–3 day freshness window.
- Pass: responsive safe-area support for Telegram and mobile screens.

## Admin Control

- Pass: owner dashboard, orders, products, FEFO/waste, categories, employees, permissions, shifts, reports, and settings.
- Pass: Admin creates employee accounts; no public signup exists.
- Pass: separate production login and in-memory Bearer flow.
- Pass: independent Cloudflare deployment.

## Overlay and modal visual consistency

Interactive overlays now follow one rule in both applications:

1. The page behind the overlay receives a darker scrim and 12px blur.
2. Modal, notification, command-search, profile-popover, success, and mobile-cart surfaces use an opaque white/blush surface.
3. The surface still has glass depth through blur, saturation, soft border, and layered shadow, but underlying text cannot show through it.
4. Regular dashboard/product cards remain translucent because they do not cover interactive content.

This prevents the readability problem caused by stacking a transparent modal over detailed tables or product cards.

## Intentional pending work

- Laravel 12 backend and database migrations
- Sanctum token issuance/revocation endpoints
- Server-side roles and permissions
- MySQL/Aiven and MinIO integration
- Docker Compose, GCP VM provisioning, and backend GitHub Actions deployment
- Real order/payment persistence and presigned photo uploads
- Phase 2 customer storefront

## Implementation note

The current frontends use React, TypeScript, Vite, and handcrafted responsive CSS. The blueprint names Tailwind, but Tailwind is not currently installed. This is a styling-tool deviation only; it does not affect the three-origin architecture, authentication, deployment, or responsive behavior. Tailwind should only be introduced if the team wants to migrate the already-established component styling rather than merely adding an unused dependency.
