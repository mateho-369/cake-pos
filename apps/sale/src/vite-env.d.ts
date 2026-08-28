/// <reference types="vite/client" />

interface TelegramWebApp {
  initData: string
  ready: () => void
  expand: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  requestContact?: (callback?: (granted: boolean) => void) => void
  /** Web App API 8.0+ (Nov 2024) — true fullscreen. Guard before calling. */
  requestFullscreen?: () => void
  exitFullscreen?: () => void
  isFullscreen?: boolean
  safeAreaInset?: { top: number; bottom: number; left: number; right: number }
  isVersionAtLeast?: (version: string) => boolean
  onEvent?: (eventType: string, handler: () => void) => void
  offEvent?: (eventType: string, handler: () => void) => void
  HapticFeedback?: {
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void
  }
}
interface Window {
  Telegram?: { WebApp?: TelegramWebApp }
}
interface ImportMetaEnv {
  readonly VITE_DEV_TELEGRAM_INIT_DATA?: string
}
