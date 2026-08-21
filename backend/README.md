# Cake POS API

Self-hosted REST API for the Admin Control and Sale Terminal frontends. It runs as a regular Node process in Docker Compose and persists its SQLite database to the `cake_pos_data` volume. It does not require Vercel, Cloudflare Workers, or a serverless runtime.

## Production setup on a Linux VM

```bash
cd backend
cp .env.example .env
# Edit .env. At minimum, set a long random JWT_SECRET and the real origins.
nano .env

# Verify the values are visible to the shell before starting Compose.
npm install
npm run check-env

# The same environment is injected into the container by env_file.
docker compose up -d --build

docker compose ps
curl http://127.0.0.1:8080/healthz
```

The API container logs the resolved database path and CORS origins at startup. To verify the variables inside the running container rather than assuming `env_file` worked:

```bash
docker compose exec api node scripts/check-env.js
```

The `DATABASE_PATH` value is intentionally overridden to `/data/cake-pos.sqlite` in Compose, and `/data` is a named persistent volume. Back up the database with:

```bash
docker compose cp api:/data/cake-pos.sqlite ./cake-pos-backup.sqlite
```

To stop the API without deleting data:

```bash
docker compose down
```

Do not run `docker compose down -v` unless the database may be deleted.

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Container port; defaults to `8080` |
| `JWT_SECRET` | Secret used to sign 12-hour Bearer tokens; required |
| `ADMIN_ORIGIN` | Exact Admin frontend origin allowed by CORS |
| `SALE_ORIGIN` | Exact Sale frontend origin allowed by CORS |
| `DATABASE_PATH` | SQLite file path; Compose sets this to `/data/cake-pos.sqlite` |
| `SEED_*` | First-install credentials, used only when the employee table is empty |

The first database creation seeds one admin and two cashier accounts. Change the seed values before the first `docker compose up` in a real environment. Seed variables do not overwrite an existing database.

## API contract

All `/api/*` routes except `POST /api/login` require:

```http
Authorization: Bearer <token>
```

`POST /api/login` accepts either:

```json
{"email":"owner@atelier.local","password":"..."}
```

or:

```json
{"pin_code":"1234"}
```

and returns `{ token, employee }`. There is no public employee signup endpoint.

Implemented routes:

- `GET/POST /api/products`, `PUT/DELETE /api/products/:id`
- `GET/POST /api/categories`, `PUT/DELETE /api/categories/:id`
- `GET/POST /api/orders`
- `GET/POST /api/employees`, `PUT/DELETE /api/employees/:id` (admin-only)
- `POST /api/shifts/open`, `POST /api/shifts/close`, `GET /api/shifts`
- `GET /api/reports/summary`
- `GET /healthz`

Order creation performs stock validation, order insertion, product stock decrement, sold/revenue updates, and order-item insertion inside one SQLite transaction. A failed stock check rolls the entire operation back.

## Local frontend development

The Vite configs proxy `/api` and `/healthz` to `http://127.0.0.1:8080` when `VITE_API_URL` is empty. Start the backend first, then:

```bash
cd backend
PORT=8080 DATABASE_PATH=/tmp/cake-pos.sqlite JWT_SECRET=local-secret \
  ADMIN_ORIGIN=http://localhost:4173 SALE_ORIGIN=http://localhost:4174 \
  npm start

# In another shell at the repository root:
npm install
npm run dev:admin
npm run dev:sale
```

For production frontend builds, set `VITE_API_URL=https://api.example.com` in each app's environment. The browser then calls the dedicated API origin rather than its own static-asset origin.
