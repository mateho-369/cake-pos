/**
 * Customer order-note audit — the Telegram Mini App storefront.
 *
 * A customer has to be able to say what the cake must actually say or taste
 * like ("Happy Birthday John", "less sugar"). The note lives on the LINE, is
 * optional, is capped like every other note field in the codebase, and must
 * reach the API inside that line's item — never as a separate free-floating
 * field, and never attached to the wrong product.
 *
 * Usage: node e2e/ui-audit/verify-shop-order-note.mjs
 */
import { build } from 'esbuild'
import { JSDOM, VirtualConsole } from 'jsdom'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'e2e/ui-audit/out')
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [join(root, 'e2e/ui-audit/shop-order-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  outfile: join(outDir, 'shop-order-entry.cjs'),
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('http://api.cake.test'),
    'import.meta.env.VITE_TELEGRAM_BOT_URL': JSON.stringify(
      'https://t.me/test_shop_bot',
    ),
  },
  jsx: 'automatic',
  logLevel: 'silent',
})

const virtualConsole = new VirtualConsole()
virtualConsole.on('jsdomError', (err) =>
  console.log('[jsdomError]', err.message.split('\n')[0]),
)
const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'http://localhost:4175/', pretendToBeVisual: true, virtualConsole },
)
const { window } = dom
window.sessionStorage.setItem('shop.language', 'en')

// A Telegram client that has already handed us a verified initData string
// and the customer's phone (phone capture itself is covered elsewhere).
window.Telegram = {
  WebApp: {
    initData: 'auth_date=1&hash=deadbeef&user=%7B%22id%22%3A77%7D',
    ready() {},
    expand() {},
    requestContact(cb) {
      cb(true)
    },
    HapticFeedback: { notificationOccurred() {} },
    setHeaderColor() {},
    setBackgroundColor() {},
  },
}

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
globalThis.Telegram = window.Telegram
window.scrollTo = () => {}

// ------------------------------------------------------------ mocked API
const products = [
  {
    id: 1,
    name: 'Matcha Cake',
    category: 'Cakes',
    price: 14.5,
    stock: 5,
    imagePosition: 'center',
  },
  {
    id: 2,
    name: 'Iced Latte',
    category: 'Drinks',
    price: 2,
    stock: 20,
    imagePosition: 'center',
  },
]
const posted = []
globalThis.fetch = async (input, init = {}) => {
  const path = new URL(String(input), 'http://api.cake.test').pathname
  const body = init.body ? JSON.parse(init.body) : null
  let payload = {}
  if (path === '/api/customer-products') {
    payload = {
      customer: { name: 'Srey Neang', phone: '+855 12 345 678' },
      products,
      categories: ['Cakes', 'Drinks'],
      storeOpen: true,
    }
  } else if (path === '/api/customer-orders/open') {
    payload = { order: null, items: [] }
  } else if (path === '/api/customer-orders') {
    posted.push(body)
    payload = {
      order: {
        id: 'TG-9',
        total: 16.5,
        status: 'Pending',
        detail: [],
        pickupCode: 'K7QZ',
      },
    }
  }
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }
}
window.fetch = globalThis.fetch

const { createRequire } = await import('node:module')
createRequire(import.meta.url)(join(outDir, 'shop-order-entry.cjs'))

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
  el?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
const type = (el, value) => {
  Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set.call(el, value)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

await sleep(500)

// Put both products in the basket, then open the cart sheet.
const addButtons = $$('.customer-add')
click(addButtons[0])
click(addButtons[1])
await sleep(150)
click($('.customer-cart-dock'))
await sleep(200)

check('cart sheet lists both chosen items', $$('.customer-cart-row').length === 2)
check(
  'every line offers an optional note field',
  $$('.customer-cart-note input').length === 2,
)
check(
  'the note field is optional and explains itself',
  ($('.customer-cart-note > span')?.textContent || '').includes('optional'),
  $('.customer-cart-note > span')?.textContent,
)
check(
  'the note is capped like every other note field in the codebase',
  $('.customer-cart-note input')?.getAttribute('maxlength') === '200',
  $('.customer-cart-note input')?.getAttribute('maxlength'),
)

// Only the CAKE gets a note — the drink must stay noteless.
type($$('.customer-cart-note input')[0], 'Happy Birthday John')
await sleep(120)
click($('.customer-cart-sheet .customer-send'))
await sleep(400)

const sent = posted[0]
check('the order reached the API', Boolean(sent), JSON.stringify(sent))
check(
  "the customer's note travels inside its own line",
  sent?.items?.[0]?.productId === 1 &&
    sent?.items?.[0]?.note === 'Happy Birthday John',
  JSON.stringify(sent?.items?.[0]),
)
check(
  'a line without a note sends none at all (no empty strings)',
  sent?.items?.[1]?.productId === 2 && !('note' in (sent?.items?.[1] || {})),
  JSON.stringify(sent?.items?.[1]),
)
check(
  'the rest of the order payload is unchanged',
  sent?.requestedTotal === '16.50' && Boolean(sent?.idempotencyKey),
  JSON.stringify({
    requestedTotal: sent?.requestedTotal,
    idempotencyKey: Boolean(sent?.idempotencyKey),
  }),
)

console.log(
  failures === 0
    ? '\nALL SHOP ORDER-NOTE CHECKS PASSED'
    : `\n${failures} CHECK(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
