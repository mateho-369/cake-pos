/**
 * Targeted verification of the admin Orders page: the toolbar's single
 * Export button + format dropdown, the Khmer-localized order statuses
 * (tabs, pills and the pending panel), and the row structure that powers
 * the phone card layout (.order-row-meta grouping).
 *
 * Usage: node e2e/ui-audit/verify-orders-page.mjs
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
  outfile: join(outDir, 'entry-orders-page.cjs'),
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('http://api.cake.test'),
  },
  jsx: 'automatic',
  logLevel: 'silent',
})

// ---------------------------------------------------------------- fixtures
const now = new Date()
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
const at = (hour, minute) =>
  new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
  ).toISOString()
const statuses = ['Pending', 'Completed', 'Cancelled', 'Ready']
const ordersPayload = Array.from({ length: 12 }, (_, index) => {
  const telegram = index % 3 === 0
  const status = statuses[index % statuses.length]
  return {
    id: `CS-${500 + index}`,
    pickupCode: telegram ? `K${index}QZ` : null,
    createdAt: at(9, index),
    time: `09:${String(index).padStart(2, '0')}`,
    date: iso(now),
    cashier: telegram ? 'Customer order' : 'Sophea Chan',
    customer: telegram ? { name: `Customer ${index}` } : null,
    source: telegram ? 'telegram' : 'walk-in',
    items: (index % 5) + 1,
    subtotal: 10 * (index + 1),
    total: 10 * (index + 1),
    payment: index % 2 === 0 ? 'Cash' : 'KHQR',
    status,
    detail: [`Matcha Cake × ${(index % 5) + 1}`],
    lineItems: [],
  }
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
  'HTMLSelectElement',
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
  'URL',
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
window.URL.createObjectURL = () => 'blob:mock'
window.URL.revokeObjectURL = () => {}
window.HTMLAnchorElement.prototype.click = function () {}
window.confirm = () => true

window.fetch = async (url) => {
  const p = new URL(String(url)).pathname
  const body = (o) =>
    new Response(JSON.stringify(o), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  if (p === '/api/orders') return body(ordersPayload)
  if (p === '/api/reports/cashiers') return body([])
  if (p === '/api/reports/audit') return body([])
  if (p === '/api/orders/pending') return body([])
  if (p === '/api/reports/retention')
    return body({
      customersWithOrders: 0,
      newCustomers: 0,
      returningCustomers: 0,
      repeatRatePercent: 0,
      repeatCustomers: 0,
      customers: [],
    })
  if (p.endsWith('/products')) return body([])
  if (p.endsWith('/categories')) return body([])
  if (p.endsWith('/employees')) return body([])
  if (p.endsWith('/customers')) return body([])
  if (p.endsWith('/shifts')) return body([])
  if (p.endsWith('/shifts/current')) return body(null)
  if (p === '/api/reports/summary')
    return body({
      todaySalesTotal: 0,
      todayOrdersCount: 0,
      netRevenueCents: 0,
      completedOrderCount: 0,
      revenueData: [],
      topProducts: [],
    })
  if (p === '/api/reports/freshness')
    return body({ wasteThisWeekCents: 0, events: [] })
  if (p === '/api/settings/pos-rules')
    return body({ defaultShelfLifeDays: 3, maxCashierDiscountPercent: 10 })
  if (p === '/api/settings/business-profile')
    return body({
      businessName: 'G-Cake',
      locationName: 'Toul Kork',
      address: '12 Street 315, Phnom Penh',
      phone: '+855 12 345 678',
    })
  return body(null)
}
globalThis.fetch = window.fetch
globalThis.Response = Response

const { createRequire } = await import('node:module')
createRequire(import.meta.url)(join(outDir, 'entry-orders-page.cjs'))
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
const nav = (label) => {
  const item = $$('.sidebar-nav .nav-item').find((b) =>
    b.textContent.includes(label),
  )
  if (item) click(item)
}
const button = (label) =>
  $$('button').find((b) => b.textContent.trim() === label)
const rows = () => $$('button.order-full-row.phase2-order-row')

await sleep(500)
nav('Sales & orders')
await sleep(350)

// --------------------------------------------------- one Export, not two
check(
  'the toolbar has ONE Export button (no separate Word/Excel buttons)',
  button('Export') !== undefined &&
    button('Word') === undefined &&
    button('Excel') === undefined,
)
click(button('Export'))
await sleep(100)
check(
  'Export opens a format menu containing Word and Excel',
  $('.export-menu-list') !== null &&
    $$('.export-menu-list button')
      .map((b) => b.textContent.trim())
      .join(',') === 'Word,Excel',
  $$('.export-menu-list button')
    .map((b) => b.textContent.trim())
    .join(','),
)
check(
  'the Export trigger exposes aria-expanded while the menu is open',
  $$('.export-menu > button')[0]?.getAttribute('aria-expanded') === 'true',
)
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
await sleep(100)
check('Escape closes the format menu', $('.export-menu-list') === null)

// ------------------------------------------- statuses follow the language
const statusTabs = () => $$('.filter-tabs button')
check(
  'status tabs render the English labels in the en UI',
  ['Pending', 'Completed', 'Cancelled', 'Released'].every((label) =>
    statusTabs().some((tab) => tab.textContent.trim() === label),
  ),
  statusTabs()
    .map((tab) => tab.textContent.trim())
    .join(','),
)
const kmToggle = $$('.language-toggle button').find(
  (b) => b.textContent.trim() === 'ខ្មែរ',
)
if (!kmToggle) {
  check('the header exposes a language toggle', false)
} else {
  click(kmToggle)
  await sleep(150)
  check(
    'switching to Khmer translates the status tabs (no raw English statuses)',
    statusTabs().every(
      (tab) =>
        ![
          'Pending',
          'Confirmed',
          'Paid',
          'Ready',
          'Held',
          'Completed',
          'Refunded',
          'Cancelled',
          'Released',
        ].includes(tab.textContent.trim()),
    ) && statusTabs().some((tab) => tab.textContent.trim() === 'រង់ចាំ'),
    statusTabs()
      .map((tab) => tab.textContent.trim())
      .join(','),
  )
  check(
    'row status badges are translated too',
    rows().length > 0 &&
      $$('.status-badge').every((badge) =>
        ['រង់ចាំ', 'បានបញ្ចប់', 'បានលុបចោល', 'រួចរាល់'].some((label) =>
          badge.textContent.includes(label),
        ),
      ),
    [...new Set($$('.status-badge').map((b) => b.textContent.trim()))].join(
      ',',
    ),
  )
  check(
    'the Export button label follows the language (នាំចេញ)',
    $$('.export-menu > button')[0]?.textContent.includes('នាំចេញ'),
  )
  const enToggle = $$('.language-toggle button').find(
    (b) => b.textContent.trim() === 'EN',
  )
  click(enToggle)
  await sleep(150)
}

// ------------------------------------- row structure for the phone layout
check(
  'every row groups items + payment in .order-row-meta (desktop keeps 8 columns via display:contents)',
  rows().length > 0 &&
    rows().every((row) => {
      const meta = row.querySelector('.order-row-meta')
      return (
        meta !== null &&
        meta.querySelector('.payment-pill') !== null &&
        row.children.length === 7
      )
    }),
  `${rows().length} rows`,
)

console.log(
  failures === 0
    ? '\nALL ORDERS-PAGE CHECKS PASSED'
    : `\n${failures} CHECK(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
