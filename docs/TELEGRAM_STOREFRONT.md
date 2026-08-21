# Telegram Mini Apps and bot separation

Two different BotFather bots are required. Do not reuse one bot for both Mini Apps:

- **Private staff bot** — opens `apps/sale`; keep it unlisted and share it only with employees. Telegram is only a display shell here. Staff still authenticate with PIN or email/password and the app never uses Telegram identity.
- **Public shop bot** — owns `apps/shop`; customers open and message this bot. Its `SHOP_TELEGRAM_BOT_TOKEN` is the only bot token the Laravel customer-authentication endpoints use.

A Telegram Mini App belongs to one bot, so the two BotFather registrations and usernames must remain distinct.

## Telegram-only shop enforcement

`apps/shop` reads only `window.Telegram?.WebApp?.initData`. It has no development fallback and does not render the catalog when init data is absent; direct browser visitors see a full-screen instruction and `VITE_TELEGRAM_BOT_URL` link.

This frontend gate is not treated as authentication. Laravel independently verifies the signed init data on every customer product, profile, order, and status request. Missing, malformed, expired, or incorrectly signed values receive HTTP 401. The verification uses Telegram's documented two-stage HMAC-SHA256 algorithm with `SHOP_TELEGRAM_BOT_TOKEN`. Phone data is accepted only through the separately secret-authenticated Bot API contact webhook.

## Configuration

1. Register the staff and public shop bots separately in BotFather.
2. Set the public bot's Mini App URL to the deployed `apps/shop` URL.
3. Set `VITE_TELEGRAM_BOT_URL=https://t.me/<public-shop-bot>` in the shop build.
4. Configure `SHOP_TELEGRAM_BOT_TOKEN`, both bot usernames, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, and optional `KHQR_IMAGE_URL` in Laravel.
5. Register the public shop bot webhook:

```bash
curl -X POST "https://api.telegram.org/bot${SHOP_TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://api.example.com/api/telegram/webhook","secret_token":"YOUR_TELEGRAM_WEBHOOK_SECRET","allowed_updates":["message"]}'
```

To retain the strict two-origin CORS policy, publish the shop beneath the configured sale origin through an edge/reverse-proxy path such as `https://sale.example.com/shop/`.
