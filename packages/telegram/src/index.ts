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
 *   5. Disables Telegram's vertical swipe-to-minimise, which otherwise
 *      fires while a cashier scrolls the product grid or a long report.
 *   6. Publishes the insets every surface must pad by, as custom
 *      properties on <html> (see syncTelegramInsets):
 *        --tg-safe-*         the DEVICE inset (notch, home indicator)
 *        --tg-content-safe-* the strip Telegram's OWN fullscreen chrome
 *                            (back/close pill, "..." menu) sits in
 *        --tg-inset-*        the sum — what layouts should actually use
 *      env(safe-area-inset-*) cannot see Telegram's chrome, and Telegram
 *      does not reliably expose env() inside its webview, which is why
 *      headers ended up underneath the back/close pill in fullscreen.
 *      Surfaces pad with
 *      max(12px, env(safe-area-inset-top), var(--tg-inset-top, 0px)),
 *      a no-op in a plain browser (variable absent -> 0px).
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
  /**
   * 'ios' | 'android' | 'tdesktop' | 'macos' | 'web' | … and 'unknown'
   * when telegram-web-app.js is loaded by an ordinary browser tab. The
   * script always defines window.Telegram.WebApp, so this is the only
   * honest way to tell a real Mini App from a desktop browser visit.
   */
  platform?: string
  onEvent?: (eventType: string, handler: () => void) => void
  offEvent?: (eventType: string, handler: () => void) => void
  /**
   * Web App API 7.7+ — stops a vertical swipe from minimising/closing the
   * Mini App. A POS is one big scroller (product grid, held queue, reports)
   * and every one of those scrolls used to risk dropping the cashier out of
   * the app mid-sale.
   */
  disableVerticalSwipes?: () => void
  enableVerticalSwipes?: () => void
  /** Web App API 6.2+ — "are you sure?" before the Mini App is closed. */
  enableClosingConfirmation?: () => void
  disableClosingConfirmation?: () => void
  /**
   * Telegram's own hardware-style back control, drawn in its chrome. Using
   * it (instead of only an in-page arrow) is what makes a Mini App feel
   * native — and on fullscreen clients it is the control the user reaches
   * for first.
   */
  BackButton?: {
    show?: () => void
    hide?: () => void
    onClick?: (handler: () => void) => void
    offClick?: (handler: () => void) => void
    isVisible?: boolean
  }
  requestContact?: (callback?: (granted: boolean) => void) => void
  HapticFeedback?: {
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void
  }
}

const BRAND_HEADER = '#FDF2F6'

const INSET_SIDES = ['top', 'right', 'bottom', 'left'] as const

/**
 * What Telegram's own fullscreen controls need at the top when the client
 * reports nothing usable. macOS/desktop clients can enter fullscreen from
 * their menu while reporting zeroed insets (a known client bug), and a
 * cashier cannot tap a New sale button that Telegram's close pill is
 * sitting on top of. 56px clears the pill on every client we have seen.
 */
const FULLSCREEN_MIN_TOP = 56

/**
 * Ceiling for a single inset. Some clients have shipped nonsense here (the
 * web client once reported the whole window height as the bottom inset);
 * a runaway value would push the entire UI off-screen, which is worse than
 * ignoring the inset.
 */
const MAX_INSET = 200

const insetPx = (value: unknown): number => {
  const raw = Number(value ?? 0)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return Math.min(raw, MAX_INSET)
}

/**
 * Publishes Telegram's insets on <html> so every layout can clear BOTH the
 * device notch AND Telegram's own overlaid chrome:
 *
 *   --tg-safe-top          device inset (notch / status bar)
 *   --tg-content-safe-top  Telegram's fullscreen chrome (back/close pill),
 *                          measured INSIDE the safe area
 *   --tg-inset-top         the two added together — use this one
 *
 * The sum matters. `contentSafeAreaInset` is documented as the space to
 * avoid "at the top of the CONTENT area", i.e. it is relative to the safe
 * area, not to the screen: on an iPhone in fullscreen the device inset is
 * ~59px of status bar and the content inset is another ~46px for the
 * back/close pill drawn below it. Taking max() of the two (what this used
 * to do) reserves 59px and leaves the app header sitting under Telegram's
 * buttons — exactly the "the back button covers my buttons" report. Adding
 * them reserves the full ~105px.
 *
 *   padding-top: max(12px, env(safe-area-inset-top), var(--tg-inset-top, 0px));
 *
 * env(safe-area-inset-*) is kept as the plain-browser path: Telegram does
 * not reliably expose it inside its webview, and outside Telegram the
 * custom properties are simply absent (the 0px fallback changes nothing).
 *
 * Values are re-read inside the handler because they change after mount —
 * rotation, and Telegram's chrome appearing/disappearing — as reported by
 * safeAreaChanged / contentSafeAreaChanged / fullscreenChanged.
 *
 * Writes once immediately: the entry points call this before React mounts,
 * so the very first paint already clears Telegram's chrome. Returns the
 * unsubscribe; the properties themselves are deliberately NOT removed on
 * cleanup, so React StrictMode's double-mount cannot flash the header
 * under Telegram's buttons for a frame.
 */
export function syncTelegramInsets(
  webApp: TelegramChromeTarget | undefined,
): () => void {
  if (!webApp || typeof document === 'undefined') return () => undefined
  const rootStyle = document.documentElement?.style
  if (!rootStyle) return () => undefined

  const write = () => {
    const safeArea = webApp.safeAreaInset
    const contentArea = webApp.contentSafeAreaInset
    for (const side of INSET_SIDES) {
      const safe = insetPx(safeArea?.[side])
      const content = insetPx(contentArea?.[side])
      let total = safe + content
      if (side === 'top' && webApp.isFullscreen && total < FULLSCREEN_MIN_TOP) {
        // Fullscreen with no usable numbers: reserve room anyway rather
        // than let Telegram's controls land on the app's own buttons.
        total = FULLSCREEN_MIN_TOP
      }
      rootStyle.setProperty(`--tg-safe-${side}`, `${safe}px`)
      rootStyle.setProperty(`--tg-content-safe-${side}`, `${content}px`)
      rootStyle.setProperty(`--tg-inset-${side}`, `${total}px`)
    }
  }

  write()
  const events = [
    'contentSafeAreaChanged',
    'safeAreaChanged',
    'fullscreenChanged',
    'viewportChanged',
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
 * Telegram's native back control. Passing a handler shows the button and
 * routes taps to it; the returned cleanup hides it again and unsubscribes,
 * so a screen can own the button for exactly as long as it is mounted.
 * Outside Telegram (or on a client without BackButton) it is a no-op and
 * the in-page back arrow remains the only way back.
 */
export function setTelegramBackButton(
  webApp: TelegramChromeTarget | undefined,
  handler: (() => void) | null,
): () => void {
  const button = webApp?.BackButton
  if (!button || typeof button.onClick !== 'function' || !handler) {
    return () => undefined
  }
  try {
    button.onClick(handler)
    button.show?.()
  } catch {
    return () => undefined
  }
  return () => {
    try {
      button.offClick?.(handler)
      button.hide?.()
    } catch {
      /* older wrapper */
    }
  }
}

/**
 * "Are you sure?" when the Mini App is about to be closed. Turned on only
 * while there is something to lose (a cart mid-sale), never permanently —
 * a confirmation on every close would train staff to dismiss it.
 */
export function setTelegramClosingConfirmation(
  webApp: TelegramChromeTarget | undefined,
  active: boolean,
): () => void {
  if (!webApp || typeof webApp.enableClosingConfirmation !== 'function') {
    return () => undefined
  }
  if (!active) return () => undefined
  try {
    webApp.enableClosingConfirmation()
  } catch {
    return () => undefined
  }
  return () => {
    try {
      webApp.disableClosingConfirmation?.()
    } catch {
      /* older wrapper */
    }
  }
}

/**
 * ready() + expand() + brand colours + no swipe-to-minimise. Safe to call
 * more than once and safe to call before React mounts (from an app entry
 * point). Also publishes the --tg-safe-* / --tg-content-safe-* /
 * --tg-inset-* custom properties (see syncTelegramInsets); the returned
 * cleanup unsubscribes them — entry-point callers that never clean up
 * simply keep them alive for the whole page, which is intended.
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
    // Scrolling a product grid, a held queue or a report must never
    // minimise the app (Web App API 7.7+; older clients simply lack it).
    webApp.disableVerticalSwipes?.()
  } catch {
    /* An older wrapper without these methods is already as ready as it can be. */
  }
  return syncTelegramInsets(webApp)
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

/** The Mini App host object, or undefined when the script never loaded. */
export function getTelegramWebApp(): TelegramChromeTarget | undefined {
  if (typeof window === 'undefined') return undefined
  // Read the host object structurally instead of relying on each app to
  // declare the same `Window.Telegram` augmentation — a consumer that
  // forgets it should still get working helpers, not a type error.
  const host = window as unknown as {
    Telegram?: { WebApp?: TelegramChromeTarget }
  }
  return host.Telegram?.WebApp
}

/**
 * True only inside a real Telegram client. telegram-web-app.js defines
 * window.Telegram.WebApp in ANY browser tab that loads it, where it reports
 * platform 'unknown' — a staff member opening the terminal on a laptop must
 * not get Telegram's fullscreen padding reserved for chrome that isn't
 * there. Clients/stubs that predate the field are treated as Telegram
 * (that was the previous behaviour, and the padding is harmless there).
 */
export function isTelegramClient(
  webApp: TelegramChromeTarget | undefined = getTelegramWebApp(),
): boolean {
  if (!webApp) return false
  return webApp.platform === undefined || webApp.platform !== 'unknown'
}
