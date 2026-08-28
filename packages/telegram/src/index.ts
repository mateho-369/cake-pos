/**
 * Shared Telegram Mini App chrome for EVERY surface that can be launched
 * from the shop's bot: the customer storefront (apps/shop), the staff
 * terminal (apps/sale) and the customer storefront served by the sale app
 * at /customer.
 *
 * Why this lives in a package instead of inside one app: fullscreen must
 * behave identically everywhere. A surface that only calls expand() opens
 * "expanded" (still inside Telegram's rounded sheet with a status-bar
 * inset); the owner reported that as the Mini App looking half-open.
 *
 * Behaviour:
 *   1. ready() + expand() immediately (works on every client).
 *   2. requestFullscreen() when the client is Web App API 8.0+ — true
 *      edge-to-edge.
 *   3. Some clients (notably iOS) only honour fullscreen after a user
 *      gesture. A `fullscreenFailed` event therefore schedules exactly one
 *      retry on the next real interaction, instead of silently giving up.
 *   4. Returns a cleanup function so React StrictMode's double-mount (and
 *      real unmounts) never leak the listener or double-fire the retry.
 */

/**
 * Structural view of window.Telegram.WebApp: every member the apps actually
 * touch, all optional except ready/expand. Apps keep their own `Window`
 * augmentation; this is what the shared helpers accept.
 */
export type TelegramChromeTarget = {
  ready: () => void
  expand: () => void
  initData?: string
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  /** Web App API 8.0+ (Nov 2024) — true edge-to-edge fullscreen. */
  requestFullscreen?: () => void
  exitFullscreen?: () => void
  isFullscreen?: boolean
  safeAreaInset?: { top: number; bottom: number; left: number; right: number }
  isVersionAtLeast?: (version: string) => boolean
  onEvent?: (eventType: string, handler: () => void) => void
  offEvent?: (eventType: string, handler: () => void) => void
  requestContact?: (callback?: (granted: boolean) => void) => void
  HapticFeedback?: {
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void
  }
}

const BRAND_HEADER = '#FDF2F6'

/**
 * ready() + expand() + brand colours. Safe to call more than once and safe
 * to call before React mounts (from an app entry point).
 */
export function prepareTelegramChrome(
  webApp: TelegramChromeTarget | undefined,
  options: { headerColor?: string; backgroundColor?: string } = {},
): void {
  if (!webApp) return
  try {
    webApp.ready()
    webApp.expand()
    webApp.setHeaderColor?.(options.headerColor ?? BRAND_HEADER)
    webApp.setBackgroundColor?.(options.backgroundColor ?? BRAND_HEADER)
  } catch {
    /* An older wrapper without these methods is already as ready as it can be. */
  }
}

/**
 * Requests true fullscreen and returns the cleanup that MUST be called on
 * unmount (removes the gesture retry + the fullscreenFailed listener).
 */
export function requestTelegramFullscreen(
  webApp: TelegramChromeTarget | undefined,
): () => void {
  if (!webApp) return () => undefined
  const supportsFullscreen =
    typeof webApp.requestFullscreen === 'function' &&
    (webApp.isVersionAtLeast?.('8.0') ?? false)
  if (!supportsFullscreen) return () => undefined

  let retried = false
  let subscribed = false
  let armed = false

  const cleanup = () => {
    if (armed) {
      armed = false
      document.removeEventListener('pointerdown', retryOnGesture)
    }
    if (subscribed) {
      subscribed = false
      try {
        webApp.offEvent?.('fullscreenFailed', onFullscreenFailed)
      } catch {
        /* older wrapper */
      }
    }
  }

  function retryOnGesture() {
    if (retried) return
    retried = true
    try {
      webApp?.requestFullscreen?.()
    } catch {
      /* expand() already applied */
    }
    cleanup()
  }

  function onFullscreenFailed() {
    if (armed) return
    armed = true
    document.addEventListener('pointerdown', retryOnGesture, { once: true })
  }

  try {
    webApp.onEvent?.('fullscreenFailed', onFullscreenFailed)
    subscribed = true
    webApp.requestFullscreen?.()
  } catch {
    // Old wrappers throw synchronously when the method is unsupported.
    // Fall back to the gesture path instead of crashing the Mini App.
    onFullscreenFailed()
  }

  return cleanup
}

/** Combined entry point: chrome + fullscreen. Returns the cleanup. */
export function applyTelegramFullscreen(
  webApp: TelegramChromeTarget | undefined,
  options: { headerColor?: string; backgroundColor?: string } = {},
): () => void {
  prepareTelegramChrome(webApp, options)
  return requestTelegramFullscreen(webApp)
}

/** The Mini App host object, or undefined when opened in a plain browser. */
export function getTelegramWebApp(): TelegramChromeTarget | undefined {
  return typeof window === 'undefined'
    ? undefined
    : (window.Telegram?.WebApp as TelegramChromeTarget | undefined)
}
