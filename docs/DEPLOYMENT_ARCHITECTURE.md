# Three-origin deployment architecture

The repository now contains the shared backend API. The three deployable pieces remain separate:

```text
Cashier browser / Telegram WebView
    └── https://sale.yourdomain.com       (Cloudflare static frontend)

Owner browser
    └── https://admin.yourdomain.com      (Cloudflare static frontend)

Both frontends
    └── HTTPS + Authorization: Bearer ...
        └── https://api.yourdomain.com    (DNS/proxy to the VM)
            └── GCP VM / Docker Compose
                └── Node REST API + persistent SQLite volume
```

The backend is intentionally a regular self-hosted Node service rather than a Vercel/serverless function. Its production files live in `backend/`.

## Frontend environment

Build each Cloudflare frontend with:

```env
VITE_API_URL=https://api.yourdomain.com
VITE_DEMO_MODE=false
```

Local Vite development leaves `VITE_API_URL` empty and proxies `/api` to `http://127.0.0.1:8080`. Production builds use the absolute API origin because the static frontend origins are different browser origins.

## Bearer-token login

```text
POST /api/login
Content-Type: application/json

{ "email": "owner@example.com", "password": "..." }

or

{ "pin_code": "1234" }

200 OK
{
  "token": "signed-bearer-token",
  "employee": { "id": 1, "name": "Owner", "role": "admin" }
}
```

Every subsequent `/api/*` request must send `Authorization: Bearer <token>`. The frontends keep the token in `sessionStorage` for the current tab/session and remove it on sign-out. There is no employee registration endpoint. Employee creation is admin-only.

## API CORS

The backend reads `ADMIN_ORIGIN` and `SALE_ORIGIN` from its environment and only allows those exact origins. It returns `Vary: Origin`, allows `GET, POST, PUT, PATCH, DELETE, OPTIONS`, and allows `Accept, Authorization, Content-Type`. Cookie credentials are disabled.

Example verification:

```bash
curl -i -X OPTIONS 'https://api.yourdomain.com/api/orders' \
  -H 'Origin: https://admin.yourdomain.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

Repeat with the sale origin and confirm an unrelated origin is rejected.

## VM deployment

```bash
cd backend
cp .env.example .env
# Set JWT_SECRET, ADMIN_ORIGIN, SALE_ORIGIN, and seed credentials.
npm install
npm run check-env
docker compose up -d --build
docker compose exec api node scripts/check-env.js
```

The second env check is intentional: it proves that `env_file` values are visible inside the running container. Compose mounts the named `cake_pos_data` volume at `/data`, where the SQLite file is stored. See [`backend/README.md`](../backend/README.md) for backups and the complete endpoint list.

## Backend guardrails

- Order creation validates stock and updates order, order-items, stock, sold count, and revenue in one SQLite transaction.
- Expired product status is computed server-side from `bestBefore` versus the server's current date.
- Product/category/employee writes are authenticated; employee management is admin-only.
- Products with order history are deactivated instead of physically deleting the audit-linked row.
- The backend does not depend on Cloudflare, Vercel, or a browser runtime.
- The single-VM SQLite deployment is aimed at fast real-world testing. Move to a managed relational database before operating multiple API replicas.
