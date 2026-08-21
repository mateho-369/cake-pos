/// <reference types="vite/client" />
interface TelegramWebApp {
  initData: string
  ready: () => void
  expand: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  requestContact?: (callback?: (granted: boolean) => void) => void
  HapticFeedback?: {
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void
  }
}
interface Window {
  Telegram?: { WebApp?: TelegramWebApp }
}
interface ImportMetaEnv {
  readonly VITE_TELEGRAM_BOT_URL?: string
}
