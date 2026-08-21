# Staff sale terminal

Staff POS for checkout, shifts, discounts, receipts, and order history. Telegram is only an optional display container; staff always authenticate with PIN or email/password.

## Setup and development

```bash
cp .env.example .env.local
npm install                         # run at repository root
npm run dev:sale                    # http://localhost:4174
```

The development server proxies `/api` to `http://127.0.0.1:8080` when `VITE_API_URL` is empty. Quick Add photos are uploaded directly to MinIO with a Laravel-presigned URL and verified by Laravel before product creation; they are never browser-local blob URLs.

## Checks and deployment

```bash
npm run typecheck --workspace=@cake-pos/sale
npm run build --workspace=@cake-pos/sale
npm run deploy:sale
```

Production origin: `https://sale.yourdomain.com`. The private staff Telegram bot may open this URL, but Telegram identity is never used for staff authentication.
