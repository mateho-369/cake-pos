/**
 * Device capability helpers for the sale terminal.
 *
 * The customer display is a desktop-Chrome feature. On a phone or iPad
 * (coarse/touch primary input) `window.open(..., 'popup,...')` can navigate
 * the whole browser away with no obvious return path, so the button is
 * hidden unless there is a real path to a second display.
 */
export type CustomerDisplayEnv = {
  hasGetScreenDetails: boolean
  isExtendedScreen: boolean
  finePointer: boolean
  coarsePointer: boolean
}

export function supportsCustomerDisplay({
  hasGetScreenDetails,
  isExtendedScreen,
  finePointer,
  coarsePointer,
}: CustomerDisplayEnv): boolean {
  // Chrome's multi-screen window-placement API / an OS-visible extended
  // display: second-screen placement is possible and supported.
  if (hasGetScreenDetails || isExtendedScreen) return true
  // A single-screen desktop Chrome with a mouse/trackpad is still a valid
  // use case (a real second monitor can be attached, and a normal browser
  // tab is used). Coarse/touch primary input (iPad, phone) is not.
  return finePointer && !coarsePointer
}
