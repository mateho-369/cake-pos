/**
 * Targeted verification of the Admin Quick Add empty state: with NO
 * categories at all, the category area must explain itself (no silent blank
 * gap), offer an inline create, and creating one must select it without
 * discarding the cake name/price already typed.
 *
 * Usage: node e2e/ui-audit/verify-quick-add-empty-state.mjs
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
  entryPoints: [join(root, 'e2e/ui-audit/entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  outfile: join(outDir, 'entry.cjs'),
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('http://api.cake.test'),
  },
  jsx: 'automatic',
  logLevel: 'silent',
})

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'http://localhost:4173/', pretendToBeVisual: true },
)
const { window } = dom
window.sessionStorage.setItem('atelier.authToken', 'audit-token')
window.sessionStorage.setItem(
  'atelier.employee',
  JSON.stringify({
    id: 1,
    name: 'Makara Piseth',
    email: 'owner@atelier.local',
    role: 'admin',
  }),
)
window.sessionStorage.setItem('atelier.language', 'en')
for (const key of [
  'document',
  'navigator',
  'HTMLElement',
  'HTMLAnchorElement',
  'HTMLInputElement',
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
window.confirm = () => true

// ------------------------------------------------------------------ mock API
const requests = []
let categories = [] // the point of this scenario: nothing to pick from

window.fetch = async (url, init = {}) => {
  const method = (init.method || 'GET').toUpperCase()
  const p = new URL(String(url)).pathname
  let body
  try {
    body = init.body ? JSON.parse(init.body) : undefined
  } catch {
    body = undefined
  }
  requests.push({ method, p, body })
  const json = (payload, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  if (method === 'GET') {
    if (p === '/api/categories') return json(categories)
    if (p.endsWith('/products')) return json([])
    if (p === '/api/orders') return json([])
    if (p === '/api/employees') return json([])
    if (p === '/api/customers') return json([])
    if (p === '/api/shifts') return json([])
    if (p === '/api/shifts/current') return json(null)
    if (p === '/api/reports/summary')
      return json({
        todaySalesTotal: 0,
        todayOrdersCount: 0,
        netRevenueCents: 0,
        revenueData: [],
        topProducts: [],
      })
    if (p === '/api/reports/freshness') return json({ wasteThisWeekCents: 0 })
    if (p === '/api/settings/pos-rules')
      return json({ defaultShelfLifeDays: 3 })
    return json(null)
  }
  // An admin's own category is not a proposal: no pendingReview flag.
  if (method === 'POST' && p === '/api/categories') {
    const created = {
      id: 5,
      name: body?.name ?? '',
      color: '#be185d',
      items: 0,
      active: 0,
      revenue: 0,
      parentId: null,
      parentName: null,
      sortOrder: 1,
      pendingReview: false,
    }
    categories = [...categories, created]
    return json(created, 201)
  }
  if (method === 'POST' && p === '/api/products') {
    return json(
      {
        id: 42,
        ...body,
        category: 'Seasonal',
        active: true,
        stock: Number(body?.stock ?? 0),
      },
      201,
    )
  }
  return json({ message: `UNMOCKED ${method} ${p}` }, 500)
}
globalThis.fetch = window.fetch
globalThis.Response = Response

const { createRequire } = await import('node:module')
createRequire(import.meta.url)(join(outDir, 'entry.cjs'))

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
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set
  setter.call(el, value)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

await sleep(500)
click($('.header-add'))
await sleep(300)

// ------------------------------------------------------- empty state (addendum)
check('quick add modal is open', $('.add-cake-form') !== null)
check(
  'no silent blank space: an empty-state block is rendered',
  $('.category-empty') !== null,
)
const emptyText = ($('.category-empty')?.textContent || '')
  .replace(/\s+/g, ' ')
  .trim()
check(
  'empty state says there are no categories',
  /No categories yet/.test(emptyText),
  emptyText,
)
check(
  'empty state explains how to proceed',
  emptyText.length > 'No categories yet'.length,
  emptyText,
)
check('an inline create row is offered', $('.category-new-row input') !== null)
check(
  'create button starts disabled',
  $('.category-new-button')?.disabled === true,
)

// ------------------------------------------------- typed values are preserved
const nameInput = $('.add-cake-form input[name="name"]')
const priceInput = $('.currency-input input')
type(nameInput, 'Mango Sticky Cake')
type(priceInput, '4.25')
await sleep(120)

type($('.category-new-row input'), 'Seasonal')
await sleep(100)
check(
  'create button enables once a name is typed',
  $('.category-new-button')?.disabled === false,
)
click($('.category-new-button'))
await sleep(400)

const createCall = requests.find(
  (r) => r.method === 'POST' && r.p === '/api/categories',
)
check(
  'category create call was sent',
  Boolean(createCall),
  JSON.stringify(createCall?.body),
)
check(
  'created category is immediately selected as a chip',
  $$('.category-chips button').some(
    (b) =>
      b.textContent.trim() === 'Seasonal' && b.className.includes('active'),
  ),
)
check(
  'empty state is gone now that a category exists',
  $('.category-empty') === null,
)
check(
  'typed cake name survived creating a category',
  $('.add-cake-form input[name="name"]').value === 'Mango Sticky Cake',
  $('.add-cake-form input[name="name"]').value,
)
check(
  'typed price survived creating a category',
  $('.currency-input input').value === '4.25',
  $('.currency-input input').value,
)

// ------------------------------------------------------- submit carries the id
$('.add-cake-form').dispatchEvent(
  new window.Event('submit', { bubbles: true, cancelable: true }),
)
await sleep(400)
const productCall = requests.find(
  (r) => r.method === 'POST' && r.p === '/api/products',
)
check(
  'product was submitted',
  Boolean(productCall),
  JSON.stringify(productCall?.body),
)
check(
  'product carries the real categoryId (5) of the just-created category',
  productCall?.body?.categoryId === 5,
  JSON.stringify(productCall?.body),
)
check(
  'product keeps the typed name and price',
  productCall?.body?.name === 'Mango Sticky Cake' &&
    Number(productCall?.body?.price) === 4.25,
)

console.log(
  failures === 0
    ? '\nALL QUICK ADD EMPTY-STATE CHECKS PASSED'
    : `\n${failures} CHECK(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
