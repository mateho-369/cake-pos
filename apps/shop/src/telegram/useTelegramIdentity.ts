import { useEffect } from 'react'

/**
 * Telegram initData is only a transport credential. Laravel verifies its HMAC
 * on every customer request before treating it as an identity.
 */
export function useTelegramIdentity() {
  const webApp = window.Telegram?.WebApp
  const initData = webApp?.initData || ''
  const botUrl =
    import.meta.env.VITE_TELEGRAM_BOT_URL || 'https://t.me/your_shop_bot'

  useEffect(() => {
    webApp?.ready()
    webApp?.expand()
    webApp?.setHeaderColor?.('#FDF2F6')
    webApp?.setBackgroundColor?.('#FDF2F6')
  }, [webApp])

  return {
    webApp,
    initData,
    botUrl,
    launchedInTelegram: initData.length > 0,
  }
}
