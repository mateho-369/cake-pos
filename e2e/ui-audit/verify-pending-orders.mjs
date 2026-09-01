/**
 * Targeted verification of the pending Telegram customer-order queue on
 * the sale terminal: the toolbar entry (paper-plane icon + live count,
 * always visible), the Accept action, the staff Reject action (confirmation
 * first — it is destructive: cancels the order and releases its reserved
 * stock), and the Telegram Message action next to the phone link.
 *
 * Usage: node e2e/ui-audit/verify-pending-orders.mjs
 */
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'e2e/ui-audit/out')
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [join(root, 'e2e/ui-audit/pending-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  outfile: join(outDir, 'pending-entry.cjs'),
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('http://api.cake.test'),
    'import.meta.env.VITE_DEMO_MODE': JSON.stringify('false'),
  },
  jsx: 'automatic',
  logLevel: 'silent',
})

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'http://localhost:4174/', pretendToBeVisual: true },
)
const { window } = dom
window.sessionStorage.setItem('atelier.authToken', 'audit-token')
window.sessionStorage.setItem('atelier.language', 'en')
for (const key of [
  'document',
  'navigator',
  'HTMLElement',
  'HTMLAnchorElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'Element',
  'Node',
  'SVGElement',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'InputEvent',
  'Event',
  'EventTarget',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'MessageChannel',
  'localStorage',
  'sessionStorage',
  'Blob',
  'File',
  'FileReader',
  'FormData',
  'Headers',
  'AbortController',
  'ResizeObserver',
  'IntersectionObserver',
  'DOMParser',
  'MutationObserver',
]) {
  if (window[key] !== undefined) {
    try {
      globalThis[key] = window[key]
    } catch {}
  }
}
globalThis.window = window
window.scrollTo = () => {}
window.URL.createObjectURL = () => 'blob:mock'
window.URL.revokeObjectURL = () => {}
window.HTMLAnchorElement.prototype.click = function () {}

const { createRequire } = await import('node:module')
createRequire(import.meta.url)(join(outDir, 'pending-entry.cjs'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (label, cond, extra = '') => {
  console.log(
    `${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`,
  )
  if (!cond) failures++
}
const $ = (sel) => window.document.querySelector(sel)
const $$ = (sel) => [...window.document.querySelectorAll(sel)]
const click = (el) =>
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
const type = (el, value) => {
  const proto =
    el instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

await sleep(500)

// ------------------------------------------------- toolbar discoverability
check(
  'toolbar has a pending-orders button (distinct from the holds button)',
  $('.pending-orders-button') !== null &&
    $('.held-orders-button') !== null &&
    $('.pending-orders-button') !== $('.held-orders-button'),
)
check(
  'pending badge shows the live count (2)',
  $('.pending-orders-button .count-badge')?.textContent.trim() === '2',
  $('.pending-orders-button .count-badge')?.textContent,
)
check(
  'held badge is a separate queue (1)',
  $('.held-orders-button .count-badge')?.textContent.trim() === '1',
)
click($('.pending-orders-button'))
check(
  'toolbar button opens the pending queue on demand',
  window.__toolbarPendingClicks === 1,
)
check(
  'empty panel (opened from toolbar) explains itself instead of vanishing',
  $('#case-empty .pending-panel-empty') !== null,
  ($('#case-empty .pending-panel-empty')?.textContent || '').slice(0, 80),
)

// ---------------------------------------------------------------- the cards
check('both pending orders render as cards', $$('.pending-card').length === 2)
check(
  'card shows the pickup code',
  $$('.pending-card')[0].textContent.includes('K7QZ'),
)
check(
  'phone link dials the customer',
  $$('.pending-card')[0]
    .querySelector('.pending-phone')
    ?.getAttribute('href') === 'tel:+855 12 345 678',
)
check(
  'stale order is flagged',
  $$('.pending-card')[1].textContent.includes('STALE'),
)
check(
  'Message action appears for a Telegram-reachable customer',
  $$('.pending-card')[0].querySelector('.pending-message-button') !== null,
)
check(
  'no Message action for a customer without a Telegram chat id',
  $$('.pending-card')[1].querySelector('.pending-message-button') === null,
)
// ------------------------------------------- customer notes on the card
check(
  'each ordered line is listed on the card',
  $$('.pending-card')[0].querySelectorAll('.pending-items li').length === 2,
  String($$('.pending-card')[0].querySelectorAll('.pending-items li').length),
)
check(
  "the customer's note for a line is shown before staff call them",
  $$('.pending-card')[0]
    .querySelector('.pending-item-note')
    ?.textContent.includes('Happy Birthday John'),
  $$('.pending-card')[0].querySelector('.pending-item-note')?.textContent,
)
check(
  'the note sits on ITS line, not on the whole order',
  $$('.pending-card')[0].querySelectorAll('.pending-items li')[0].querySelector(
    '.pending-item-note',
  ) !== null &&
    $$('.pending-card')[0]
      .querySelectorAll('.pending-items li')[1]
      .querySelector('.pending-item-note') === null,
)
check(
  'a card without line items still lists what was ordered',
  $$('.pending-card')[1].textContent.includes('Chocolate Cake × 1'),
)

check(
  'Take payment is still offered',
  $$('.pending-card')[0].textContent.includes('Take payment'),
)

// -------------------- accept coexists with reject (both must be offered)
check(
  'Accept (park as held) is offered next to Reject',
  $$('.pending-card')[0].querySelector('.pending-accept-button') !== null &&
    $$('.pending-card')[0].querySelector('.pending-reject-button') !== null,
)
click($$('.pending-card')[0].querySelector('.pending-accept-button'))
await sleep(200)
check(
  'Accept parks THAT order without any confirmation prompt',
  window.__calls.find((c) => c.kind === 'accept')?.orderId === 'TG-31',
  JSON.stringify(window.__calls.find((c) => c.kind === 'accept')),
)

// ------------------------------------------------- reject: confirm first
click($$('.pending-card')[0].querySelector('.pending-reject-button'))
await sleep(150)
check(
  'reject opens a confirmation prompt first',
  $('.pending-reject-note') !== null,
)
check(
  'nothing is rejected before the cashier confirms',
  !window.__calls.some((c) => c.kind === 'reject'),
)
type($('.pending-reject-reason input'), 'Customer says they never placed it')
click($('.pending-reject-confirm'))
await sleep(300)
const rejectCall = window.__calls.find((c) => c.kind === 'reject')
check(
  'confirming rejects THAT order with the typed reason',
  rejectCall?.orderId === 'TG-31' &&
    rejectCall?.arg === 'Customer says they never placed it',
  JSON.stringify(rejectCall),
)
check(
  'rejection is confirmed with a toast',
  window.__toasts.some((t) => t.includes('Rejected K7QZ')),
  JSON.stringify(window.__toasts),
)

// ------------------------------------- reject can be backed out of
click($$('.pending-card')[1].querySelector('.pending-reject-button'))
await sleep(150)
click($('.pending-reject-cancel'))
await sleep(150)
check(
  '"Keep it" closes the prompt without rejecting',
  window.__calls.filter((c) => c.kind === 'reject').length === 1 &&
    $('.pending-reject-note') === null,
)

// ------------------------------------------------- telegram message
click($$('.pending-card')[0].querySelector('.pending-message-button'))
await sleep(150)
check(
  'message opens a note composer',
  $('.pending-message-text textarea') !== null,
)
check(
  'send starts disabled until a note is typed',
  $('.pending-message-send')?.disabled === true,
)
type(
  $('.pending-message-text textarea'),
  'Your order is ready — see you at 4pm!',
)
check(
  'send enables once a note is typed',
  $('.pending-message-send')?.disabled === false,
)
click($('.pending-message-send'))
await sleep(300)
const messageCall = window.__calls.find((c) => c.kind === 'message')
check(
  'the note goes to the order, as typed',
  messageCall?.orderId === 'TG-31' &&
    messageCall?.arg === 'Your order is ready — see you at 4pm!',
  JSON.stringify(messageCall),
)
check(
  'delivery is confirmed with a toast',
  window.__toasts.some((t) => t.includes('Message sent to Srey Neang')),
  JSON.stringify(window.__toasts),
)

// ------------------------------- the note survives Accept (held queue)
check(
  'the accepted order still shows the note on its held card',
  $('#case-held .held-item-note')?.textContent.includes('Happy Birthday John'),
  $('#case-held .held-item-note')?.textContent,
)
check(
  'only the line that carries a note shows one on the held card',
  $$('#case-held .held-items li').length === 2 &&
    $$('#case-held .held-items li')[1].querySelector('.held-item-note') === null,
)

console.log(
  failures === 0
    ? '\nALL PENDING-ORDERS CHECKS PASSED'
    : `\n${failures} CHECK(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
