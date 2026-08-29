import { useEffect, useState } from 'react'
import {
  type TelegramChromeTarget,
  applyTelegramFullscreen,
  getTelegramWebApp,
} from './index'

/**
 * Runs the shared Telegram chrome on mount (ready + expand + brand colours
 * + true fullscreen with a single gesture retry + publishing Telegram's
 * content safe area as --tg-content-safe-* custom properties for the
 * headers' padding) and cleans it up on unmount, so React StrictMode's
 * double-mount cannot leak listeners.
 */
export function useTelegramChrome(options: {
  headerColor?: string
  backgroundColor?: string
} = {}): { webApp: TelegramChromeTarget | undefined; inTelegram: boolean } {
  const [webApp] = useState<TelegramChromeTarget | undefined>(getTelegramWebApp)
  const { headerColor, backgroundColor } = options

  useEffect(() => {
    return applyTelegramFullscreen(webApp, { headerColor, backgroundColor })
  }, [webApp, headerColor, backgroundColor])

  return { webApp, inTelegram: Boolean(webApp) }
}
