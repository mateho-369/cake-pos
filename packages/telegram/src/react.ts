import { useEffect, useRef, useState } from 'react'
import {
  type TelegramChromeTarget,
  applyTelegramFullscreen,
  getTelegramWebApp,
  isTelegramClient,
  setTelegramBackButton,
  setTelegramClosingConfirmation,
} from './index'

/**
 * Runs the shared Telegram chrome on mount (ready + expand + brand colours
 * + no swipe-to-minimise + true fullscreen with a single gesture retry +
 * publishing Telegram's insets as --tg-safe-* / --tg-content-safe-* /
 * --tg-inset-* custom properties for the headers' padding) and cleans it up
 * on unmount, so React StrictMode's double-mount cannot leak listeners.
 */
export function useTelegramChrome(
  options: {
    headerColor?: string
    backgroundColor?: string
  } = {},
): { webApp: TelegramChromeTarget | undefined; inTelegram: boolean } {
  const [webApp] = useState<TelegramChromeTarget | undefined>(getTelegramWebApp)
  const { headerColor, backgroundColor } = options

  useEffect(() => {
    return applyTelegramFullscreen(webApp, { headerColor, backgroundColor })
  }, [webApp, headerColor, backgroundColor])

  return { webApp, inTelegram: isTelegramClient(webApp) }
}

/**
 * Owns Telegram's native back control for as long as the calling screen is
 * mounted: pass the action to run on tap, or null/undefined on screens that
 * have nowhere to go back to (the terminal itself, the dashboard).
 *
 * The handler is kept in a ref so a component that rebuilds its callback on
 * every render — the normal case — does not resubscribe (and briefly hide)
 * the button each time. Outside Telegram this does nothing at all and the
 * in-page back arrow stays the only way back.
 */
export function useTelegramBackButton(
  onBack: (() => void) | null | undefined,
): void {
  const handler = useRef(onBack)
  handler.current = onBack
  const active = Boolean(onBack)

  useEffect(() => {
    if (!active) return
    return setTelegramBackButton(getTelegramWebApp(), () => {
      handler.current?.()
    })
  }, [active])
}

/**
 * Asks Telegram to confirm before closing while `active` is true — used
 * when there is unsaved work on screen (a cart that has not been paid for),
 * so a stray swipe or tap on the close button cannot silently bin a sale.
 */
export function useTelegramClosingConfirmation(active: boolean): void {
  useEffect(() => {
    return setTelegramClosingConfirmation(getTelegramWebApp(), active)
  }, [active])
}
