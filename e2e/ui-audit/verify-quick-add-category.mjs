/**
 * Targeted verification of the Quick Add category picker (Bug #1).
 *
 * Renders the REAL sale Quick Add modal in jsdom against a mocked API whose
 * category list contains a category with ZERO products, and asserts the whole
 * flow: the empty category is pickable, the submit button stays disabled until
 * a category is chosen, and "+ Add category" creates the category, selects it,
 * and (for a cashier) surfaces the pending-review note.
 *
 * Usage: node e2e/ui-audit/verify-quick-add-category.mjs
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
  entryPoints: [join(root, 'e2e/ui-audit/sale-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  outfile: join(outDir, 'sale-entry.cjs'),
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('http://api.cake.test'),
    'import.meta.env.VITE_DEMO_MODE': JSON.stringify('false'),
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
globalThis.self = window
window.URL.createObjectURL = () => 'blob:mock'
window.URL.revokeObjectURL = () => {}
window.confirm = () => true
window.alert = () => {}

// ------------------------------------------------------------------ mock API
// "Seasonal" has NO product in it — that is exactly the category the old
// product-derived chip list hid, producing "unknown category: Signature".
const categoryList = [
  {
    id: 1,
    name: 'Signature',
    color: '#be185d',
    items: 1,
    active: 1,
    revenue: 28,
    parentId: null,
    parentName: null,
    sortOrder: 1,
  },
  {
    id: 2,
    name: 'Seasonal',
    color: '#3b82f6',
    items: 0,
    active: 0,
    revenue: 0,
    parentId: null,
    parentName: null,
    sortOrder: 2,
  },
  {
    id: 3,
    name: 'Coffee',
    color: '#d97706',
    items: 0,
    active: 0,
    revenue: 0,
    parentId: 2,
    parentName: 'Seasonal',
    sortOrder: 3,
  },
]
const products = [
  {
    id: 11,
    name: 'Strawberry Cloud',
    category: 'Signature',
    categoryId: 1,
    price: 28,
    stock: 4,
    sold: 0,
    revenue: 0,
    status: 'fresh',
    madeAt: '2026-08-27',
    bestBefore: '2026-08-30',
    imagePosition: '50% 50%',
    active: true,
  },
]
const requests = []
let createdCategory = null

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
    if (p === '/api/products') return json(products)
    if (p === '/api/categories')
      return json(
        createdCategory ? [...categoryList, createdCategory] : categoryList,
      )
    if (p === '/api/orders') return json([])
    if (p === '/api/shifts/current') return json(null)
    if (p === '/api/settings/pos-rules')
      return json({ defaultShelfLifeDays: 3 })
    return json(null)
  }
  if (method === 'POST' && p === '/api/categories') {
    // Mirrors the backend: a cashier's category is live (active) at once and
    // flagged pendingReview; createdBy is the cashier; parentCategoryId is
    // never honoured for a non-admin.
    createdCategory = {
      id: 9,
      name: body?.name ?? '',
      color: '#be185d',
      items: 0,
      active: 0,
      revenue: 0,
      parentId: null,
      parentName: null,
      sortOrder: 9,
      pendingReview: true,
      createdBy: 'Sophea Chan',
      createdAt: new Date().toISOString(),
    }
    return json(createdCategory, 201)
  }
  return json({ message: `UNMOCKED ${method} ${p}` }, 500)
}
globalThis.fetch = window.fetch
globalThis.Response = Response

const { createRequire } = await import('node:module')
createRequire(import.meta.url)(join(outDir, 'sale-entry.cjs'))

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
const text = (sel) => ($(sel)?.textContent || '').replace(/\s+/g, ' ').trim()
const click = (el) =>
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
const type = (el, value) => {
  // React tracks the value setter, so write through the prototype setter.
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set
  setter.call(el, value)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

await sleep(500)

// ---------------------------------------------------------- chips render
check('quick add modal rendered', $('.quick-add-layout') !== null)
const chips = $$('.quick-category-chips button').map((b) =>
  b.textContent.trim(),
)
check(
  'chips come from the live category list (Signature + Seasonal + Coffee)',
  chips.includes('Signature') &&
    chips.includes('Seasonal') &&
    chips.includes('Coffee'),
  chips.join(' | '),
)
check(
  'a category with ZERO products is still selectable (Bug #1 regression)',
  chips.includes('Seasonal'),
  chips.join(' | '),
)
check(
  'no hardcoded default is preselected',
  $$('.quick-category-chips button.active').length === 0,
)

// --------------------------------------------- submit is gated on a category
const submitButton = () =>
  $$('.modal-actions .primary-button').find((b) =>
    b.className.includes('primary-button'),
  )
check(
  'publish button is disabled until a category is picked',
  submitButton()?.disabled === true,
)
check(
  'disabled button explains why',
  (submitButton()?.getAttribute('title') || '').length > 0,
  submitButton()?.getAttribute('title') || '',
)

// ------------------------------------------- picking the empty category works
const seasonalChip = $$('.quick-category-chips button').find(
  (b) => b.textContent.trim() === 'Seasonal',
)
click(seasonalChip)
await sleep(120)
check(
  'picking the empty category selects it',
  seasonalChip.className.includes('active'),
)
check(
  'publish button enables once a category is picked',
  submitButton()?.disabled === false,
)

// ------------------------------------------------- "+ Add category" creates it
const newInput = $('.category-new-row input')
check('new-category input is present', newInput !== null)
type(newInput, 'Pchum Ben Specials')
await sleep(80)
const addButton = $('.category-new-button')
check(
  'add-category button enables once a name is typed',
  addButton?.disabled === false,
)
click(addButton)
await sleep(250)

const createCall = requests.find(
  (r) => r.method === 'POST' && r.p === '/api/categories',
)
check('create request was sent', Boolean(createCall))
check(
  'create request sends the name and no parent',
  createCall?.body?.name === 'Pchum Ben Specials' &&
    createCall?.body?.parentCategoryId === undefined,
  JSON.stringify(createCall?.body),
)
check(
  'the new category is created AND selected (chips include it, active)',
  $$('.quick-category-chips button').some(
    (b) =>
      b.textContent.trim() === 'Pchum Ben Specials' &&
      b.className.includes('active'),
  ),
)
check(
  'the pending-review note is shown for a cashier-proposed category',
  text('.pending-review-note').length > 0,
  text('.pending-review-note'),
)
check(
  'publish button stays enabled after creating',
  submitButton()?.disabled === false,
)

// ------------------------------------------- submitting carries the real id
const nameInput = $('.field-grid input')
const priceInput = $('.currency-input input')
check('cake name input is present', Boolean(nameInput))
type(nameInput, 'Knom Pchum Ben')
type(priceInput, '3.50')
await sleep(120)
check(
  'the typed name survived creating a category',
  nameInput.value === 'Knom Pchum Ben',
  nameInput.value,
)
$('.quick-add-layout').dispatchEvent(
  new window.Event('submit', { bubbles: true, cancelable: true }),
)
await sleep(150)
const result = window.__quickAddResult
check(
  'submitting the form produced a product',
  Boolean(result),
  JSON.stringify(result),
)
check(
  'the product carries the real categoryId (9), not a guessed name',
  result?.categoryId === 9,
  JSON.stringify(
    result && { categoryId: result.categoryId, category: result.category },
  ),
)
check(
  'the product carries the category name for legacy callers',
  result?.category === 'Pchum Ben Specials',
)
check(
  'the product name/price were not lost while adding a category',
  result?.name === 'Knom Pchum Ben' && result?.price === 3.5,
  JSON.stringify(result && { name: result.name, price: result.price }),
)

console.log(
  failures === 0
    ? '\nALL QUICK ADD CATEGORY CHECKS PASSED'
    : `\n${failures} CHECK(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
