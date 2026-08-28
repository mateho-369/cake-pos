import { useTelegramChrome } from '@cake-pos/telegram/react'

/**
 * Telegram initData is only a transport credential. Laravel verifies its HMAC
 * on every customer request before treating it as an identity.
 *
 * The chrome work (ready → expand → true fullscreen, with one retry after the
 * first user gesture because iOS clients reject a programmatic request before
 * any interaction) is shared with the sale app via @cake-pos/telegram, so
 * every Mini App surface opens edge-to-edge.
 */
export function useTelegramIdentity() {
  const { webApp } = useTelegramChrome()
  // Read live (never frozen into state): a client that finishes the Mini App
  // handshake a tick later must not be stuck on the "open from Telegram" gate.
  const initData = webApp?.initData || ''
  const botUrl =
    import.meta.env.VITE_TELEGRAM_BOT_URL || 'https://t.me/your_shop_bot'

  return {
    webApp,
    initData,
    botUrl,
    launchedInTelegram: initData.length > 0,
  }
}
