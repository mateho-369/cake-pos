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
    if (!webApp) return
    webApp.ready()
    webApp.expand()
    webApp.setHeaderColor?.('#FDF2F6')
    webApp.setBackgroundColor?.('#FDF2F6')

    // True edge-to-edge fullscreen landed in Telegram Web App API 8.0
    // (November 2024) alongside safeAreaInset. Guard by BOTH the client
    // version and the method existing, and fall back to plain expand() on
    // older clients. Some clients only honour fullscreen after a user
    // gesture, so a fullscreenFailed event schedules one retry on the first
    // interaction instead of silently giving up.
    const supportsFullscreen =
      typeof webApp.requestFullscreen === 'function' &&
      (webApp.isVersionAtLeast?.('8.0') ?? false)
    if (supportsFullscreen) {
      let retried = false
      const retryOnGesture = () => {
        if (retried) return
        retried = true
        try {
          webApp.requestFullscreen?.()
        } catch {
          /* older wrapper — expand() already applied */
        }
        document.removeEventListener('pointerdown', retryOnGesture)
        cleanup()
      }
      const onFullscreenFailed = () => {
        document.addEventListener('pointerdown', retryOnGesture, {
          once: true,
        })
      }
      const cleanup = () =>
        webApp.offEvent?.('fullscreenFailed', onFullscreenFailed)
      webApp.onEvent?.('fullscreenFailed', onFullscreenFailed)
      try {
        webApp.requestFullscreen?.()
      } catch {
        onFullscreenFailed()
      }
    }
  }, [webApp])

  return {
    webApp,
    initData,
    botUrl,
    launchedInTelegram: initData.length > 0,
  }
}
