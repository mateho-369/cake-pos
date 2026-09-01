/**
 * Shift-gate reminder audit — the sale terminal's "Open your shift" banner.
 *
 * The reminder used to be one big fixed-position button centred over the
 * page: it covered other controls and the ONLY way to interact with it was
 * to start the open-shift flow. It must now be:
 *   1. dismissable, with a close control separate from the CTA,
 *   2. laid out in the page flow (never position:fixed over the toolbar),
 *   3. still completely toothless as far as enforcement goes — attempting a
 *      real sale action without a shift must re-prompt AND bring the
 *      reminder back, exactly as before.
 *
 * Usage: node e2e/ui-audit/verify-shift-gate.mjs
 */
import { build } from 'esbuild'
import { JSDOM, VirtualConsole } from 'jsdom'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'e2e/ui-audit/out')
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [join(root, 'e2e/ui-audit/shift-gate-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  outfile: join(outDir, 'shift-gate-entry.cjs'),
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('http://api.cake.test'),
    'import.meta.env.VITE_DEMO_MODE': JSON.stringify('false'),
  },
  jsx: 'automatic',
  logLevel: 'silent',
})

// ---------------------------------------------------------------- jsdom
const virtualConsole = new VirtualConsole()
virtualConsole.on('jsdomError', (err) =>
  console.log('[jsdomError]', err.message.split('\n')[0]),
)
const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'http://localhost:4174/', pretendToBeVisual: true, virtualConsole },
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
window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
})

// ------------------------------------------------------------ mocked API
// No shift is open — that is the whole point of this audit.
let shiftOpened = false
const products = [
  {
    id: 1,
    name: 'Matcha Cake',
    category: 'Whole cakes',
    price: 12,
    stock: 6,
    sold: 0,
    revenue: 0,
    status: 'Fresh',
    madeAt: '2026-09-01',
    bestBefore: '2026-09-04',
    imagePosition: 'center',
    active: true,
  },
]
const routes = {
  '/api/products': () => products,
  '/api/categories': () => [{ id: 1, name: 'Whole cakes' }],
  '/api/orders': () => [],
  '/api/orders/held': () => [],
  '/api/orders/pending': () => [],
  '/api/shifts/current': () => (shiftOpened ? { status: 'Open' } : null),
  '/api/settings/pos-rules': () => ({
    defaultShelfLifeDays: 3,
    exchangeRateKhrPerUsd: 4100,
  }),
}
globalThis.fetch = async (input) => {
  const path = new URL(String(input), 'http://api.cake.test').pathname
  const handler = routes[path]
  return {
    ok: Boolean(handler),
    status: handler ? 200 : 404,
    headers: { get: () => 'application/json' },
    json: async () => (handler ? handler() : { message: 'not mocked' }),
    text: async () => JSON.stringify(handler ? handler() : {}),
  }
}
window.fetch = globalThis.fetch

const { createRequire } = await import('node:module')
createRequire(import.meta.url)(join(outDir, 'shift-gate-entry.cjs'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (label, cond, extra = '') => {
  console.log(
    `${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`,
  )
  if (!cond) failures++
}
const $ = (sel) => window.document.querySelector(sel)
const click = (el) =>
  el?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))

await sleep(600)

// ------------------------------------------------------- it is offered…
check(
  'shift-less terminal shows the open-shift reminder',
  $('.shift-gate-banner') !== null,
)
check(
  'the reminder still offers the open-shift call to action',
  $('.shift-gate-banner .shift-gate-open') !== null,
)
check(
  'the reminder has a close control SEPARATE from that call to action',
  $('.shift-gate-banner .shift-gate-dismiss') !== null &&
    $('.shift-gate-banner .shift-gate-dismiss') !==
      $('.shift-gate-banner .shift-gate-open'),
)
check(
  'the reminder is not itself one giant button (it is an aside, not a click target)',
  $('.shift-gate-banner')?.tagName.toLowerCase() === 'aside',
  $('.shift-gate-banner')?.tagName,
)
check(
  'the close control is reachable by name for assistive tech',
  Boolean($('.shift-gate-banner .shift-gate-dismiss')?.getAttribute('aria-label')),
  $('.shift-gate-banner .shift-gate-dismiss')?.getAttribute('aria-label'),
)

// ---------------------------------------- …in the flow, not over the page
const css = readFileSync(join(root, 'apps/sale/src/index.css'), 'utf8')
const bannerRule = css.slice(
  css.indexOf('.shift-gate-banner {'),
  css.indexOf('}', css.indexOf('.shift-gate-banner {')),
)
check(
  'the reminder is laid out in the page flow, never fixed over other controls',
  bannerRule.includes('position: relative') &&
    !bannerRule.includes('position: fixed'),
  bannerRule.split('\n')[1]?.trim(),
)
check(
  'no stacking context that could sit above the toolbar (z-index < header 40)',
  Number((bannerRule.match(/z-index:\s*(\d+)/) || [])[1] ?? 0) < 40,
  (bannerRule.match(/z-index:\s*(\d+)/) || [])[1],
)
check(
  'it is a sibling ABOVE the product/cart layout, so it pushes content down',
  $('.shift-gate-banner')?.nextElementSibling?.classList.contains(
    'terminal-layout',
  ),
  $('.shift-gate-banner')?.nextElementSibling?.className,
)

// ------------------------------------------------------------- dismissal
click($('.shift-gate-banner .shift-gate-dismiss'))
await sleep(150)
check('closing the reminder actually dismisses it', $('.shift-gate-banner') === null)
check(
  'the rest of the terminal keeps working after dismissing',
  $('.terminal-layout') !== null && $('.quick-add-fab') !== null,
)

// ------------------- dismissing must NOT weaken the actual shift gate
const productCard = $('.product-card') || $('.product-grid button')
click(productCard)
await sleep(200)
check(
  'a sale action without a shift still opens the shift prompt',
  $('.shift-modal-body') !== null &&
    window.document.body.textContent.includes('Open your shift'),
  $('.shift-modal-body') ? 'shift modal open' : 'no shift modal',
)
check(
  'nothing was added to the cart while shift-less',
  !window.document.body.textContent.includes('View order') ||
    $('.cart-line') === null,
)
check(
  'the dismissed reminder comes back once a sale action is attempted',
  $('.shift-gate-banner') !== null,
)

console.log(
  failures === 0
    ? '\nALL SHIFT-GATE CHECKS PASSED'
    : `\n${failures} CHECK(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
