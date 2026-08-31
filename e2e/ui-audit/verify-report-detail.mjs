/**
 * Targeted verification of Reports → transaction-detail table: the
 * drill-down list of individual orders that sits under the summary
 * rollups. Renders the REAL admin app against a mocked API and asserts
 * that the table exists (a real <table>), honours the Reports date-range
 * preset, sorts by column and paginates 25/50/100/All with an accurate
 * "Showing X–Y of Z" counter.
 *
 * Usage: node e2e/ui-audit/verify-report-detail.mjs
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
  outfile: join(outDir, 'entry-report-detail.cjs'),
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
const at = (year, month, day, hour, minute = 5) =>
  new Date(year, month, day, hour, minute, 0).toISOString()
// 30 orders today (so the "This month" preset covers them whatever the
// calendar says when this runs), one per minute so the sort is decidable...
const thisMonth = Array.from({ length: 30 }, (_, index) => {
  const day = now.getDate()
  const telegram = index % 3 === 0
  return {
    id: `CS-${100 + index}`,
    pickupCode: telegram ? `K${index}QZ` : null,
    createdAt: at(now.getFullYear(), now.getMonth(), day, 9, index),
    time: '09:05 AM',
    date: iso(new Date(now.getFullYear(), now.getMonth(), day)),
    cashier: telegram ? 'Customer order' : 'Sophea Chan',
    customer: telegram ? { name: `Customer ${index}` } : null,
    source: telegram ? 'telegram' : 'walk-in',
    items: (index % 5) + 1,
    subtotal: index + 1,
    total: index + 1,
    payment: index % 2 === 0 ? 'Cash' : 'KHQR',
    status: 'Completed',
    detail: [`Matcha Cake × ${(index % 5) + 1}`],
    lineItems: [
      {
        productId: 1,
        description: index % 2 === 0 ? 'Matcha Cake' : 'Choco Tart',
        quantity: (index % 5) + 1,
        unitPriceCents: 100 * (index + 1),
        lineTotalCents: 100 * (index + 1),
      },
    ],
  }
})
// ...and 2 in the previous month, which must NOT show under "This month".
const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15)
const lastMonth = [0, 1].map((index) => ({
  id: `LM-${index}`,
  pickupCode: null,
  createdAt: at(
    lastMonthDate.getFullYear(),
    lastMonthDate.getMonth(),
    15 + index,
    11,
  ),
  time: '11:05 AM',
  date: iso(lastMonthDate),
  cashier: 'Vibol Sok',
  customer: null,
  source: 'walk-in',
  items: 9,
  subtotal: 900,
  total: 900,
  payment: 'Cash',
  status: 'Completed',
  detail: ['Old order × 9'],
}))
const ordersPayload = [...thisMonth, ...lastMonth]
// Waste events for the Waste tab's record table (today, so "This month"
// covers them), with two distinct reasons so a filter has something to do.
const wasteEvents = [0, 1, 2].map((index) => ({
  id: index + 1,
  productName: index === 2 ? 'Choco Tart' : 'Matcha Cake',
  category: 'Cakes',
  quantity: index + 1,
  reason: index === 2 ? 'Damaged' : 'Expired',
  retailValue: 5 * (index + 1),
  recordedAt: at(now.getFullYear(), now.getMonth(), now.getDate(), 15, index),
  recordedBy: 'Sophea Chan',
}))

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
  'document', 'navigator', 'HTMLElement', 'HTMLAnchorElement', 'HTMLInputElement',
  'HTMLSelectElement', 'Element', 'Node', 'SVGElement', 'CustomEvent', 'MouseEvent',
  'KeyboardEvent', 'InputEvent', 'Event', 'EventTarget', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'MessageChannel', 'localStorage',
  'sessionStorage', 'Blob', 'File', 'FileReader', 'FormData', 'Headers',
  'AbortController', 'ResizeObserver', 'IntersectionObserver', 'DOMParser',
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
    return body({ customersWithOrders: 0, newCustomers: 0, returningCustomers: 0, repeatRatePercent: 0, repeatCustomers: 0, customers: [] })
  if (p.endsWith('/products')) return body([])
  if (p.endsWith('/categories')) return body([])
  if (p.endsWith('/employees')) return body([])
  if (p.endsWith('/customers')) return body([])
  if (p.endsWith('/shifts')) return body([])
  if (p.endsWith('/shifts/current')) return body(null)
  if (p === '/api/reports/summary')
    return body({ todaySalesTotal: 0, todayOrdersCount: 0, netRevenueCents: 0, completedOrderCount: 0, revenueData: [], topProducts: [] })
  if (p === '/api/reports/freshness')
    return body({
      wasteThisWeekCents: 0,
      events: wasteEvents,
    })
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
createRequire(import.meta.url)(join(outDir, 'entry-report-detail.cjs'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`)
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
const rows = () => $$('.report-detail-table tbody tr')
const cell = (row, index) => row.children[index].textContent.trim()

await sleep(500)
nav('Reports')
await sleep(350)

// ------------------------------------------------ the table actually exists
check(
  'Reports renders a real <table> transaction-detail list',
  $('.report-detail-panel table.report-detail-table') !== null,
)
check(
  'it has one row per order, not an aggregate rollup',
  $$('.report-detail-table thead th').length === 9,
  String($$('.report-detail-table thead th').length),
)
const headers = $$('.report-detail-table thead th').map((th) =>
  th.textContent.trim(),
)
check(
  'columns: date/time, order, source, employee, customer/cashier, items, payment, total, status',
  [
    'Date & time',
    'Order',
    'Source',
    'Employee',
    'Customer / cashier',
    'Items',
    'Payment',
    'Total',
    'Status',
  ].every((label, index) => headers[index] === label),
  headers.join(' | '),
)

// -------------------------------------------------------------- pagination
check(
  'first page is capped at 25 rows (not an unbounded dump)',
  rows().length === 25,
  String(rows().length),
)
check(
  'counter shows the range and the total for the selected period',
  $('.table-pagination-count')?.textContent.trim() === 'Showing 1–25 of 30',
  $('.table-pagination-count')?.textContent,
)
click(button('Next'))
await sleep(150)
check(
  'Next shows the remaining 5 rows',
  rows().length === 5 &&
    $('.table-pagination-count').textContent.trim() === 'Showing 26–30 of 30',
  `${rows().length} rows / ${$('.table-pagination-count').textContent}`,
)
const sizeSelect = $('.table-pagination-size select')
const setSize = (value) => {
  Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    'value',
  ).set.call(sizeSelect, value)
  sizeSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
}
check(
  'page-size options are 25 / 50 / 100 / All',
  [...sizeSelect.options].map((o) => o.textContent.trim()).join(',') ===
    '25,50,100,All',
  [...sizeSelect.options].map((o) => o.textContent).join(','),
)
setSize('all')
await sleep(200)
check(
  '"All" shows every order in the range on one page',
  rows().length === 30 &&
    $('.table-pagination-count').textContent.trim() === 'Showing 1–30 of 30',
  `${rows().length} rows`,
)

// ------------------------------------------------------------------ sorting
check(
  'default sort is newest first',
  cell(rows()[0], 1).startsWith('CS-129'),
  cell(rows()[0], 1),
)
click(
  $$('.report-detail-table thead .detail-sort').find((b) =>
    b.textContent.includes('Total'),
  ),
)
await sleep(150)
check(
  'clicking Total sorts by amount (largest first)',
  cell(rows()[0], 7) === '$30.00',
  cell(rows()[0], 7),
)
click(
  $$('.report-detail-table thead .detail-sort').find((b) =>
    b.textContent.includes('Total'),
  ),
)
await sleep(150)
check(
  'clicking Total again flips to smallest first',
  cell(rows()[0], 7) === '$1.00',
  cell(rows()[0], 7),
)
click(
  $$('.report-detail-table thead .detail-sort').find((b) =>
    b.textContent.includes('Source'),
  ),
)
await sleep(150)
check(
  'sorting by Source groups Telegram orders first',
  cell(rows()[0], 2).includes('Telegram'),
  cell(rows()[0], 2),
)

// -------------------------------------------- follows the Reports date range
click(button('Last month'))
await sleep(250)
check(
  'switching to "Last month" reloads the detail table with that period only',
  rows().length === 2 &&
    rows().every((row) => cell(row, 1).startsWith('LM-')),
  rows()
    .map((row) => cell(row, 1))
    .join(','),
)
check(
  'the counter follows the range too',
  $('.table-pagination-count').textContent.trim() === 'Showing 1–2 of 2',
  $('.table-pagination-count').textContent,
)
click(button('This month'))
await sleep(250)
check(
  'switching back restores this month\'s 30 orders (page size is kept)',
  $('.table-pagination-count').textContent.trim() === 'Showing 1–30 of 30',
  $('.table-pagination-count').textContent,
)

// ----------------------------------------------------- per-column filtering
const filterSelect = (label) =>
  $$('.report-detail-filter')
    .find((wrap) => wrap.textContent.trim().startsWith(label))
    ?.querySelector('select')
const setSelect = (select, value) => {
  Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    'value',
  ).set.call(select, value)
  select.dispatchEvent(new window.Event('change', { bubbles: true }))
}
const typeSearch = (value) => {
  const input = $('.report-detail-filters .inline-search input')
  Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
}
check(
  'the record table offers per-column filters beyond the date range',
  ['Employee', 'Source', 'Payment', 'Status'].every((label) =>
    Boolean(filterSelect(label)),
  ),
  $$('.report-detail-filter')
    .map((wrap) => wrap.textContent.trim().split('\n')[0])
    .join(' | '),
)
setSelect(filterSelect('Payment'), 'KHQR')
await sleep(200)
check(
  'filtering by payment method narrows the rows',
  rows().length === 15 && rows().every((row) => cell(row, 6) === 'KHQR'),
  `${rows().length} rows`,
)
setSelect(filterSelect('Source'), 'Telegram')
await sleep(200)
check(
  'filters combine (payment + source) instead of replacing each other',
  rows().length > 0 &&
    rows().every((row) => cell(row, 6) === 'KHQR' && cell(row, 2).includes('Telegram')),
  `${rows().length} rows`,
)
click($('.report-detail-clear'))
await sleep(200)
check(
  'Clear restores the full period',
  $('.table-pagination-count').textContent.trim() === 'Showing 1–30 of 30',
  $('.table-pagination-count').textContent,
)
typeSearch('CS-110')
await sleep(200)
check(
  'free-text search matches across the record columns',
  rows().length === 1 && cell(rows()[0], 1).startsWith('CS-110'),
  `${rows().length} rows`,
)

// ------------------------------------------------ review before downloading
click(button('Review & export'))
await sleep(250)
check(
  'exporting opens a review dialog instead of downloading immediately',
  $('.export-preview-card') !== null,
)
check(
  'the dialog states the period, the record count and the active filters',
  $('.export-preview-meta')?.textContent.includes('Records') &&
    $('.export-preview-meta')?.textContent.includes('1') &&
    $('.export-preview-meta')?.textContent.includes('CS-110'),
  $('.export-preview-meta')?.textContent.replace(/\s+/g, ' ').trim(),
)
check(
  'it previews only the rows that survived the filters',
  $$('.export-preview-table tbody tr').length === 1,
  String($$('.export-preview-table tbody tr').length),
)
check(
  'Word / Excel / CSV and the en/km report language can be chosen here',
  $$('.export-preview-formats button').map((b) => b.textContent.trim()).join(',') ===
    'Word,Excel,CSV' && $$('.export-preview-language button').length === 2,
  $$('.export-preview-formats button').map((b) => b.textContent.trim()).join(','),
)
click(button('Cancel'))
await sleep(150)
check(
  'Cancel closes the dialog without downloading',
  $('.export-preview-card') === null,
)
typeSearch('')
await sleep(200)

// ------------------------------------------ shared across the analysis tabs
const tabButton = (label) =>
  $$('.report-tabs button').find((b) => b.textContent.trim() === label)
click(tabButton('Payments'))
await sleep(250)
check(
  'the Payments tab gets the same drill-down list',
  $('.report-detail-table') !== null,
)
click(tabButton('Products'))
await sleep(250)
check(
  'the Products tab browses individual sold line items, not orders',
  $$('.report-detail-table thead th')
    .map((th) => th.textContent.trim())
    .join(',') ===
    'Date & time,Order,Product,Category,Units,Unit price (USD),Line total (USD),Status',
  $$('.report-detail-table thead th').map((th) => th.textContent.trim()).join(','),
)
click(tabButton('Waste'))
await sleep(250)
check(
  'the Waste tab browses recorded waste events',
  rows().length === 3 &&
    $$('.report-detail-table thead th')[1].textContent.trim() === 'Product',
  `${rows().length} rows`,
)
setSelect(filterSelect('Reason'), 'Damaged')
await sleep(200)
check(
  'waste records filter by reason',
  rows().length === 1 && cell(rows()[0], 4) === 'Damaged',
  `${rows().length} rows`,
)
click(tabButton('Audit log'))
await sleep(250)
check(
  'event-level tabs (Audit log) keep their own detail view instead',
  $('.report-detail-table') === null,
)

console.log(
  failures === 0
    ? '\nALL REPORT-DETAIL CHECKS PASSED'
    : `\n${failures} CHECK(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
