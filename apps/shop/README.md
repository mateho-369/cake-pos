# Telegram customer shop

Public customer storefront. Unlike the staff terminal, signed Telegram `initData` is the customer's identity and there is no separate login screen.

## Setup and development

```bash
cp .env.example .env.local
npm install                         # run at repository root
npm run dev:shop                    # http://localhost:4175
```

A normal browser intentionally shows only the “open our Telegram bot” gate. End-to-end catalog testing requires launch data signed by the public shop bot; there is no unsigned development bypass.

## Checks and deployment

```bash
npm run typecheck --workspace=@cake-pos/shop
npm run build --workspace=@cake-pos/shop
npm run deploy:shop
```

Deploy beneath the sale origin (for example `https://sale.yourdomain.com/shop/`) to retain the backend's strict two-origin CORS policy. Configure `VITE_TELEGRAM_BOT_URL` with the public shop bot—not the private staff bot.
