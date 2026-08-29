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
 *   5. Publishes Telegram's CONTENT safe area — the device inset PLUS the
 *      strip overlaid by Telegram's own fullscreen UI (back/close button)
 *      — as --tg-content-safe-top/right/bottom/left custom properties on
 *      <html>. env(safe-area-inset-*) cannot see Telegram's chrome, which
 *      is why headers rendered underneath it in fullscreen. Surfaces pad
 *      with max(env(safe-area-inset-top), var(--tg-content-safe-top, 0px)),
 *      which is a no-op in a plain browser (variable absent -> 0px).
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
  /**
   * Web App API 8.0+ — like safeAreaInset, but ALSO includes the area
   * overlaid by Telegram's OWN fullscreen UI (the back/close button), so
   * it is the value headers must respect in fullscreen. Reported through
   * the contentSafeAreaChanged event.
   */
  contentSafeAreaInset?: {
    top: number
    bottom: number
    left: number
    right: number
  }
  isVersionAtLeast?: (version: string) => boolean
  onEvent?: (eventType: string, handler: () => void) => void
  offEvent?: (eventType: string, handler: () => void) => void
  requestContact?: (callback?: (granted: boolean) => void) => void
  HapticFeedback?: {
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void
  }
}

const BRAND_HEADER = '#FDF2F6'

/** CSS custom property <- Telegram inset side, published on <html>. */
const CONTENT_SAFE_AREA_PROPERTIES = [
  ['--tg-content-safe-top', 'top'],
  ['--tg-content-safe-bottom', 'bottom'],
  ['--tg-content-safe-left', 'left'],
  ['--tg-content-safe-right', 'right'],
] as const

/**
 * Publishes Telegram's content safe area as --tg-content-safe-* custom
 * properties on the document root, so every header on every surface can
 * clear BOTH the device notch and Telegram's own overlaid fullscreen UI:
 *
 *   padding-top: max(12px, env(safe-area-inset-top), var(--tg-content-safe-top, 0px));
 *
 * env(safe-area-inset-*) is the DEVICE inset only — it has no idea Telegram
 * overlays its back/close button at the top of a fullscreen Mini App, which
 * is exactly the overlap reported on iPad/mobile. In a plain browser the
 * variable is never set, the 0px fallback changes nothing.
 *
 * Prefers contentSafeAreaInset (Bot API 8.0+, shipped with fullscreen) and
 * falls back to the plain device safeAreaInset on older clients — those
 * cannot run fullscreen, so no Telegram chrome exists there and the device
 * inset alone is correct. The insets are re-read inside the handler because
 * they change after mount (rotation, the fullscreen chrome appearing and
 * disappearing), reported through safeAreaChanged / contentSafeAreaChanged;
 * fullscreenChanged is also handled as a belt-and-braces re-sync.
 *
 * Writes once immediately — the entry points call this before React mounts,
 * so the very first paint already pads correctly. Returns the unsubscribe;
 * the custom properties themselves are deliberately NOT removed on cleanup:
 * the entry-point subscription lives for the page lifetime, and wiping the
 * values mid-flight would flash the header under Telegram's chrome for a
 * frame during React StrictMode's double-mount.
 */
export function syncTelegramContentSafeArea(
  webApp: TelegramChromeTarget | undefined,
): () => void {
  if (!webApp || typeof document === 'undefined') return () => undefined
  const rootStyle = document.documentElement?.style
  if (!rootStyle) return () => undefined

  const write = () => {
    const inset = webApp.contentSafeAreaInset ?? webApp.safeAreaInset
    for (const [property, side] of CONTENT_SAFE_AREA_PROPERTIES) {
      const raw = Number(inset?.[side] ?? 0)
      const px = Number.isFinite(raw) && raw > 0 ? raw : 0
      rootStyle.setProperty(property, `${px}px`)
    }
  }

  write()
  const events = [
    'contentSafeAreaChanged',
    'safeAreaChanged',
    'fullscreenChanged',
  ]
  let subscribed = false
  try {
    for (const event of events) webApp.onEvent?.(event, write)
    subscribed = true
  } catch {
    /* Older wrapper without onEvent: the immediate write above already
       covers the static inset case. */
  }

  return () => {
    if (!subscribed) return
    try {
      for (const event of events) webApp.offEvent?.(event, write)
    } catch {
      /* older wrapper */
    }
  }
}

/**
 * ready() + expand() + brand colours. Safe to call more than once and safe
 * to call before React mounts (from an app entry point). Also publishes the
 * --tg-content-safe-* custom properties (see syncTelegramContentSafeArea);
 * the returned cleanup unsubscribes them — entry-point callers that never
 * clean up simply keep them alive for the whole page, which is intended.
 */
export function prepareTelegramChrome(
  webApp: TelegramChromeTarget | undefined,
  options: { headerColor?: string; backgroundColor?: string } = {},
): () => void {
  if (!webApp) return () => undefined
  try {
    webApp.ready()
    webApp.expand()
    webApp.setHeaderColor?.(options.headerColor ?? BRAND_HEADER)
    webApp.setBackgroundColor?.(options.backgroundColor ?? BRAND_HEADER)
  } catch {
    /* An older wrapper without these methods is already as ready as it can be. */
  }
  return syncTelegramContentSafeArea(webApp)
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
  const stopChrome = prepareTelegramChrome(webApp, options)
  const stopFullscreen = requestTelegramFullscreen(webApp)
  return () => {
    stopFullscreen()
    stopChrome()
  }
}

/** The Mini App host object, or undefined when opened in a plain browser. */
export function getTelegramWebApp(): TelegramChromeTarget | undefined {
  return typeof window === 'undefined'
    ? undefined
    : (window.Telegram?.WebApp as TelegramChromeTarget | undefined)
}
