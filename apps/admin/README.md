# Admin dashboard

Owner-only React/Vite application for products, customers, orders, staff, receipt settings, imports, and reports.

## Setup and development

```bash
cp .env.example .env.local
# Set VITE_API_URL, or leave it empty to use the local Vite proxy.
npm install                         # run at repository root
npm run dev:admin                   # http://localhost:4173
```

## Checks and deployment

```bash
npm run typecheck --workspace=@cake-pos/admin
npm run build --workspace=@cake-pos/admin
npm run deploy:admin                # Cloudflare Workers static assets
```

Production origin: `https://admin.yourdomain.com`. Laravel must receive the exact same value in `ADMIN_ORIGIN`. Product photos and KHQR images use the shared presigned R2 upload flow, including a 45-second browser timeout and server-side byte verification.
