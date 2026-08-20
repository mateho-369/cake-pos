# Production notes (POS)

Three origins, Bearer tokens, no cookie sessions.

| Host | What |
|---|---|
| `sale.yourdomain.com` | Cloudflare Worker, sale SPA |
| `admin.yourdomain.com` | Cloudflare Worker, admin SPA |
| `api.yourdomain.com` | Laravel on the VM (when written) / mock API in dev |

## Auth

Login returns `{ token, user }`. Frontends keep `token` in React state and send:

```
Authorization: Bearer <token>
```

No `credentials: 'include'`. No `/sanctum/csrf-cookie`. No `SESSION_DOMAIN`. Refreshing the tab signs the cashier out — that is intended for a POS.

## CORS (API)

Allow only the two frontend origins. Echoing `*` while sending `Authorization` is not enough in some browsers; set the exact origins.

```
Access-Control-Allow-Origin: https://sale.yourdomain.com
  (or https://admin.yourdomain.com — reflect the request Origin if it is on the allowlist)
Access-Control-Allow-Headers: Authorization, Content-Type, Accept
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
```

Do **not** set `Access-Control-Allow-Credentials: true`.

`CORS_ORIGINS=https://sale.yourdomain.com,https://admin.yourdomain.com`

## Frontends

Build with the API origin baked in:

```
VITE_API_URL=https://api.yourdomain.com/api
```

Workers (`wrangler.sale.jsonc`, `wrangler.admin.jsonc`) serve static assets only. They do **not** proxy `/api`.

## Laravel (when written)

Sanctum **token** auth (`createToken` / `auth:sanctum`), not stateful SPA cookies. Same CORS allowlist. Same JSON contract as `api/server.ts`.

VM, Aiven, MinIO, `clear_env = no`, YAML-list `minio-init`, root `.env` interpolation, `git fetch` + `reset --hard` — still apply. See `docs/lessons-learned.md`.
