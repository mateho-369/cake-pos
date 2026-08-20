/**
 * Telegram Mini App shell only.
 * We call ready() + expand() so the webview fills the client,
 * but we NEVER read initData / initDataUnsafe for authentication.
 * Staff always see the normal PIN / email login.
 */
export function initTelegram() {
  const webApp = window.Telegram?.WebApp
  if (!webApp) return

  webApp.ready()
  webApp.expand()

  try {
    webApp.setHeaderColor('#FDF2F6')
    webApp.setBackgroundColor('#FDF2F6')
  } catch {
    /* older clients */
  }
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void
        expand: () => void
        setHeaderColor: (color: string) => void
        setBackgroundColor: (color: string) => void
        initData?: string
        initDataUnsafe?: unknown
      }
    }
  }
}
