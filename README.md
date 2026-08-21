# Cake POS

Cake POS is a two-frontend point-of-sale system backed by a self-hosted REST API:

| App | Purpose | Local port | Production |
|---|---|---:|---|
| `apps/admin` | Owner operations, inventory, reports, employees | 4173 | `https://admin.yourdomain.com` |
| `apps/sale` | Staff checkout and shifts | 4174 | `https://sale.yourdomain.com` |
| `backend` | Shared authenticated REST API | 8080 | `https://api.yourdomain.com` on a Docker VM |

The backend is a normal Node service with a persistent SQLite volume under Docker Compose. It is not tied to Vercel, Workers, or another serverless-only host.

## Run locally

Start the API first:

```bash
cd backend
npm install
PORT=8080 DATABASE_PATH=/tmp/cake-pos.sqlite JWT_SECRET=local-secret \
  ADMIN_ORIGIN=http://localhost:4173 SALE_ORIGIN=http://localhost:4174 \
  npm start
```

In another shell:

```bash
npm install
npm run dev:admin
npm run dev:sale
```

When `VITE_API_URL` is empty during local Vite development, both frontends proxy `/api` to the API on port 8080. For a deployed build, set `VITE_API_URL` to the public API origin in each app's environment.

The first API start seeds credentials from `backend/.env` or its defaults. The default local cashier PIN is `1234`; the default local admin PIN is `9999`. Change these values before any real deployment.

## Self-host the API with Docker Compose

```bash
cd backend
cp .env.example .env
# Set JWT_SECRET, ADMIN_ORIGIN, SALE_ORIGIN, and seed credentials.
npm install
npm run check-env
docker compose up -d --build

docker compose exec api node scripts/check-env.js
curl http://127.0.0.1:8080/healthz
```

The second env check is deliberate: it verifies that the variables are visible inside the running container, not merely present in a local file. The database is persisted in the `cake_pos_data` named volume. See [`backend/README.md`](backend/README.md) for backup and API details.

## Authentication

`POST /api/login` accepts `{ email, password }` or `{ pin_code }` and returns `{ token, employee }`. Subsequent API calls use `Authorization: Bearer <token>`. Employees are created by admins only; there is no public signup endpoint. Frontends keep the token in `sessionStorage` for the current tab/session and remove it on sign-out.

## CORS

The API allowlist is configured with `ADMIN_ORIGIN` and `SALE_ORIGIN`; it never uses `*`. It responds to `OPTIONS` preflight requests and allows `Accept`, `Authorization`, and `Content-Type` headers. Cookie credentials are not used.

## Verification commands

```bash
npm run typecheck
npm run build
```
