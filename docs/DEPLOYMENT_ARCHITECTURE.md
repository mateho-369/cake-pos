# Three-origin deployment architecture

## Topology

```text
Cashier browser / Telegram WebView
    └── https://sale.yourdomain.com       (Cloudflare static frontend)

Owner browser
    └── https://admin.yourdomain.com      (Cloudflare static frontend)

Both frontends
    └── HTTPS + Authorization: Bearer ...
        └── https://api.yourdomain.com    (Cloudflare DNS/proxy)
            └── GCP VM / Docker Compose
                ├── nginx
                ├── Laravel 12 + PHP-FPM
                ├── MinIO
                └── queue worker (when required)
                    └── Aiven MySQL over TLS
```

The sale and admin builds are independent. Each is deployed with the same API URL but cannot use relative API paths.

## Frontend environment

Build each Cloudflare frontend with:

```env
VITE_API_URL=https://api.yourdomain.com
```

All application requests go through a shared API helper. Example:

```ts
await apiRequest('/api/orders', {
  method: 'POST',
  body: JSON.stringify(payload),
})
```

The helper produces an absolute request to `https://api.yourdomain.com/api/orders` and attaches the current in-memory Bearer token.

## Bearer-token login

Recommended Laravel flow:

```text
POST /api/login
Content-Type: application/json

{ "email": "owner@example.com", "password": "..." }

200 OK
{
  "token": "1|sanctum-plain-text-token",
  "employee": { "id": 1, "name": "Owner", "role": "admin" }
}
```

Store only the hash in the `personal_access_tokens` table. Return the plain token once. Revoke the current token on logout and support an admin “revoke all sessions” action for a compromised employee account.

The Sale Terminal uses the same endpoint and response shape for quick PIN login:

```text
POST /api/login
Content-Type: application/json

{ "pin_code": "1234" }
```

Laravel must validate that the employee is active, compare a securely hashed PIN, rate-limit failed attempts, and return the same `{ token, employee }` contract used by email/password login. The frontend then stores that token through the same in-memory API client.

The frontend deliberately does not persist the token in cookies, `localStorage`, IndexedDB, URL parameters, or Telegram state. A hard refresh requires sign-in again. This reduces token persistence but means the business must accept reauthentication after a refresh.

## Laravel CORS baseline

`config/cors.php`:

```php
return [
    'paths' => ['api/*'],
    'allowed_methods' => ['*'],
    'allowed_origins' => [
        'https://sale.yourdomain.com',
        'https://admin.yourdomain.com',
    ],
    'allowed_origins_patterns' => [],
    'allowed_headers' => [
        'Accept',
        'Authorization',
        'Content-Type',
        'Origin',
        'X-Requested-With',
    ],
    'exposed_headers' => [],
    'max_age' => 600,
    'supports_credentials' => false,
];
```

Do not use `*` for `allowed_origins` in production. Include `Vary: Origin` whenever the response varies by requesting origin. Test both successful and rejected preflights before launch.

Example verification:

```bash
curl -i -X OPTIONS 'https://api.yourdomain.com/api/orders' \
  -H 'Origin: https://admin.yourdomain.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

Repeat with the sale origin, then confirm that an unrelated origin receives no `Access-Control-Allow-Origin` response header.

## Cloudflare

- DNS records: `sale`, `admin`, and `api` are separate.
- Deploy each static frontend independently so releases can be rolled back independently.
- Add a cache bypass for `api.yourdomain.com/api/*` from day one.
- Never cache login, employee, order, shift, settings, presigned URL, or image-upload API responses.
- Static product images may be cached when served from a dedicated public object URL; presigned upload/download endpoints must not be cached.
- Keep TLS mode at Full (strict) and use an origin certificate on the VM.

## Backend implementation guardrails

- `employees` are created by admins only; no registration endpoint exists.
- Authorize every admin capability server-side. Frontend visibility is not authorization.
- Use DB transactions and row locks for order creation + stock deduction.
- Save immutable order-item price snapshots.
- Record discounts, voids, refunds, waste, stock adjustments, and shift variances in an audit trail.
- Make order creation idempotent to prevent duplicate charges when a mobile network retries.
- Calculate monetary amounts with fixed decimal values, never floating-point math.
- Expired products are blocked from sale server-side even if a stale frontend still shows them.
- Presigned MinIO PUT uploads require `AbortController` timeouts in both frontends.
- Ensure PHP-FPM uses `clear_env = no` in the production image.
- Root-level Compose `.env` supplies `${VAR}` interpolation; Laravel's `backend/.env` does not.
- One-shot Compose `command` values use YAML list form.

## API cache and failure behavior

For mutation requests, return structured errors such as:

```json
{
  "message": "Stock changed while this order was being prepared.",
  "code": "STOCK_CONFLICT",
  "errors": { "items.0.quantity": ["Only 2 units remain."] }
}
```

The sale terminal should disable payment submission while a request is pending, send an idempotency key, and show a recoverable retry state. It must never report payment success until the API confirms the order.
