# Production notes (POS)

This stack copies the Field Notes / portfolio infrastructure: Cloudflare Worker
for the SPA, Docker Compose on a **new** GCP e2-micro VM (not shared with the
portfolio), Aiven MySQL (a **new** service), MinIO for cake photos.

Laravel is not in the repo yet. When it is, follow the same sequence as the
portfolio `docs/production.md`, with these POS-specific rules baked in from day 1.

## Same-origin Worker

`worker/index.js` proxies `/api`, `/sanctum`, `/up` to the VM. Do **not** set
`VITE_API_URL`. Browser requests stay on the Worker origin so Sanctum CSRF
cookies are readable.

Add a Cloudflare **Cache Rule: bypass `/api/*`**. Cloudflare otherwise caches
by file extension and will freeze endpoints such as `/api/.../og-image.png`.

## Two env files

| File | Read by |
|---|---|
| `.env` at repo root | `docker compose` `${VAR}` interpolation (MinIO root user) |
| `backend/.env` | Laravel via `env_file:` |

They must carry the **same** `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.

## Deploy on the VM

Never `git pull`. Never make local commits on the VM.

```bash
git fetch origin main
git reset --hard origin/main
docker compose -f docker-compose.prod.yml up -d --build
```

Use `up -d --build` for the **full** stack. Do not pass `--no-deps`.
Do not `docker compose restart app` — `restart` does not reload `env_file`.

## PHP-FPM

Alpine PHP images default `clear_env = yes`. The Laravel Dockerfile must
`RUN echo "clear_env = no" >>` the real `www.conf` (find it with
`docker run --rm <image> find / -iname www.conf`).

## TRUSTED_PROXIES

The Worker forwards `CF-Connecting-IP`. Set `TRUSTED_PROXIES` on the VM to
the addresses that actually reach nginx (or Cloudflare's published ranges).
Do **not** set `*` while port 8080 is reachable from the internet.

## KHQR

MVP is a static QR the customer scans by hand; the cashier confirms receipt.
Bakong realtime comes later.
