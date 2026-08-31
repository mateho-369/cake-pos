/**
 * Targeted verification of Reports → transaction-detail table: the
 * drill-down list of individual orders that sits under the summary
 * rollups. Renders the REAL admin app against a mocked API and asserts
 * that the table exists (a real <table>), honours the Reports date-range
 * preset, sorts by column and paginates 25/50/100/All with an accurate
 * "Showing X–Y of Z" counter.
 *
 * It also drives the filter redesign: a single "Filters (n)" trigger that
 * opens a labelled-select popover, applied filters as removable chips, a
 * filter-aware empty state (a stale filter can no longer masquerade as an
 * empty period), and the single toolbar Export button.
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
  if (p === '/api/reports/audit')
    return body([
      {
        id: 1,
        at: at(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0),
        employee: 'Sophea Chan',
        employeeId: 1,
        action: 'order.discount',
        orderId: 'CS-110',
        details: { discountAmountCents: 50 },
        ip: null,
      },
      {
        id: 2,
        at: at(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0),
        employee: 'Vibol Sok',
        employeeId: 2,
        action: 'order.voided',
        orderId: 'CS-101',
        details: {},
        ip: null,
      },
      {
        id: 3,
        at: at(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0),
        employee: 'Sophea Chan',
        employeeId: 1,
        action: 'shift',
        orderId: null,
        details: { varianceUsdCents: -1000 },
        ip: null,
      },
    ])
  if (p === '/api/reports/losses')
    return body({
      wasteCents: 4200,
      discountsCents: 3100,
      voidsCents: 900,
      refundsCents: 0,
      cashShortagesCents: 1000,
      totalLostCents: 9200,
    })
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
  if (p === '/api/employees')
    return body([
      { id: 1, name: 'Sophea Chan', role: 'cashier' },
      { id: 2, name: 'Vibol Sok', role: 'cashier' },
    ])
  if (p.endsWith('/employees')) return body([])
  if (p.endsWith('/customers')) return body([])
  if (p === '/api/shifts')
    return body([
      {
        id: 1,
        employeeId: 1,
        openingCash: 100,
        openingCashUsdCents: 10000,
        openingCashKhr: 0,
        openedAt: at(now.getFullYear(), now.getMonth(), now.getDate(), 7, 30),
        closedAt: at(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0),
        expectedCashUsdCents: 20800,
        expectedCashKhr: 0,
        closingCashUsdCents: 20600,
        closingCashKhr: 0,
        varianceUsdCents: -200,
        openedBy: 'Sophea Chan',
        status: 'Closed',
      },
      {
        id: 2,
        employeeId: 2,
        openingCash: 100,
        openingCashUsdCents: 10000,
        openingCashKhr: 0,
        openedAt: at(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0),
        closedAt: at(now.getFullYear(), now.getMonth(), now.getDate(), 21, 30),
        expectedCashUsdCents: 31500,
        expectedCashKhr: 0,
        closingCashUsdCents: 31500,
        closingCashKhr: 0,
        varianceUsdCents: 0,
        openedBy: 'Vibol Sok',
        status: 'Closed',
      },
    ])
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
const rows = () => $$('.report-detail-table tbody tr')
const cell = (row, index) => row.children[index].textContent.trim()

await sleep(500)
nav('Reports')
await sleep(200)
// The sidebar Reports item is now a dropdown: pick the Sales view to enter
// the page (the old always-visible tab strip is gone).
const openReportTab = (label) => {
  const navBtn = $$('.sidebar-nav .nav-item').find((b) =>
    b.textContent.includes('Reports'),
  )
  if (navBtn && navBtn.getAttribute('aria-expanded') !== 'true') click(navBtn)
  const item = $$('.nav-submenu-item').find(
    (b) => b.textContent.trim() === label,
  )
  if (item) click(item)
  return Boolean(item)
}
openReportTab('Sales')
await sleep(350)

// ------------------------------------------ the sidebar dropdown is the hub
check(
  'the Reports nav item expands ONE dropdown with all 8 report views',
  [
    'Sales',
    'Products',
    'Payments',
    'Team',
    'Waste',
    'Losses',
    'Shifts',
    'Audit log',
  ].every((label) =>
    $$('.nav-submenu-item').some((b) => b.textContent.trim() === label),
  ),
  $$('.nav-submenu-item')
    .map((b) => b.textContent.trim())
    .join(','),
)
check(
  'the download library is gone: no library section, no download items',
  $('.report-library') === null &&
    !$$('.nav-submenu-item').some((b) =>
      b.textContent.trim().includes('summary'),
    ),
)

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

// ------------------------------------------------------- single Export button
check(
  'the toolbar has ONE Export button (no separate Word/Excel buttons)',
  button('Export') !== undefined &&
    button('Word') === undefined &&
    button('Excel') === undefined,
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

// --------------------------------------------- date presets live in ONE dropdown
check(
  'date presets are a single dropdown (the old strip is gone)',
  $('.report-date-trigger') !== null && $('.report-presets') === null,
  $('.report-date-trigger')?.textContent.replace(/\s+/g, ' ').trim(),
)
const openPresetMenu = () => {
  const trigger = $('.report-date-trigger')
  if (trigger && trigger.getAttribute('aria-expanded') !== 'true')
    click(trigger)
}
openPresetMenu()
await sleep(100)
check(
  'the preset dropdown lists all six presets plus None',
  $$('.report-date-menu button')
    .map((b) => b.textContent.trim())
    .join(',') ===
    'Today,Yesterday,This week,This month,Last month,This year,None',
  $$('.report-date-menu button')
    .map((b) => b.textContent.trim())
    .join(','),
)
click(
  $$('.report-date-menu button').find((b) => b.textContent.trim() === 'None'),
)
await sleep(250)
check(
  'None clears the date filter: every order in the store shows (32 here)',
  $('.table-pagination-count')?.textContent.trim() === 'Showing 1–32 of 32',
  $('.table-pagination-count')?.textContent,
)
openPresetMenu()
await sleep(100)
click(
  $$('.report-date-menu button').find(
    (b) => b.textContent.trim() === 'This month',
  ),
)
await sleep(250)
check(
  'picking This month restores the period',
  $('.table-pagination-count')?.textContent.trim() === 'Showing 1–30 of 30',
  $('.table-pagination-count')?.textContent,
)

// -------------------------------------------- follows the Reports date range
const pickPreset = async (label) => {
  openPresetMenu()
  await sleep(80)
  const item = $$('.report-date-menu button').find(
    (b) => b.textContent.trim() === label,
  )
  if (item) click(item)
}
await pickPreset('Last month')
await sleep(250)
check(
  'switching to "Last month" reloads the detail table with that period only',
  rows().length === 2 && rows().every((row) => cell(row, 1).startsWith('LM-')),
  rows()
    .map((row) => cell(row, 1))
    .join(','),
)
check(
  'the counter follows the range too',
  $('.table-pagination-count').textContent.trim() === 'Showing 1–2 of 2',
  $('.table-pagination-count').textContent,
)
await pickPreset('This month')
await sleep(250)
check(
  "switching back restores this month's 30 orders (page size is kept)",
  $('.table-pagination-count').textContent.trim() === 'Showing 1–30 of 30',
  $('.table-pagination-count').textContent,
)

// ------------------------------------------------------- the filter dropdown
const trigger = () => $('.report-filter-trigger')
const panelOpen = () => trigger()?.getAttribute('aria-expanded') === 'true'
const openFilters = () => {
  if (!panelOpen()) click(trigger())
}
const closeFilters = () => {
  if (panelOpen()) click(trigger())
}
const panelSelect = (label) =>
  $$('.report-filter-field')
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
  'filters sit behind ONE outlined trigger with an accurate count',
  trigger() !== null &&
    trigger().textContent.includes('Filters') &&
    trigger().textContent.includes('(0)'),
  trigger()?.textContent.replace(/\s+/g, ' ').trim(),
)
openFilters()
await sleep(100)
check('the trigger exposes aria-expanded while the panel is open', panelOpen())
check(
  'the popover offers labelled selects beyond the date range',
  ['Employee', 'Source', 'Payment', 'Status'].every((label) =>
    Boolean(panelSelect(label)),
  ),
  $$('.report-filter-field')
    .map((wrap) => wrap.textContent.trim().split('\n')[0])
    .join(' | '),
)
check(
  'the popover carries a Clear all action',
  $$('.report-filter-panel-actions button').some((b) =>
    b.textContent.includes('Clear all'),
  ),
)
setSelect(panelSelect('Payment'), 'KHQR')
await sleep(200)
check(
  'filtering by payment method narrows the rows',
  rows().length === 15 && rows().every((row) => cell(row, 6) === 'KHQR'),
  `${rows().length} rows`,
)
setSelect(panelSelect('Source'), 'Telegram')
await sleep(200)
check(
  'filters combine (payment + source) instead of replacing each other',
  rows().length > 0 &&
    rows().every(
      (row) => cell(row, 6) === 'KHQR' && cell(row, 2).includes('Telegram'),
    ),
  `${rows().length} rows`,
)
check(
  'the trigger count follows the applied filters',
  trigger().textContent.includes('(2)'),
  trigger()?.textContent.replace(/\s+/g, ' ').trim(),
)
check(
  'applied filters render as removable chips (Payment: KHQR)',
  $$('.report-filter-chip').some(
    (chip) =>
      chip.textContent.includes('Payment') && chip.textContent.includes('KHQR'),
  ),
)
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
await sleep(100)
check(
  'Escape closes the popover (and filters stay applied)',
  !panelOpen() && rows().length === 5,
  `${rows().length} rows`,
)
click(
  $$('.report-filter-chip button').find((chipButton) =>
    chipButton.closest('.report-filter-chip')?.textContent.includes('Payment'),
  ),
)
await sleep(200)
check(
  'removing a chip releases exactly that filter',
  rows().length === 10 &&
    rows().every((row) => cell(row, 2).includes('Telegram')),
  `${rows().length} rows`,
)
check(
  'the trigger count drops back to (1)',
  trigger().textContent.includes('(1)'),
)
openFilters()
await sleep(100)
window.document.body.dispatchEvent(
  new window.MouseEvent('mousedown', { bubbles: true }),
)
await sleep(100)
check('a press outside the popover closes it', !panelOpen())

// ------------------------------------ stale filters can no longer lie
// (The original bug: switching presets kept the old filter and rendered the
// generic "No orders in this period" over a non-empty range.)
openFilters()
await sleep(50)
setSelect(panelSelect('Payment'), 'KHQR')
await sleep(200)
await pickPreset('Last month')
await sleep(300)
check(
  'preset switch with an active filter shows the FILTER-aware empty state',
  $('.report-detail-empty') !== null &&
    $('.report-detail-empty span')?.textContent.trim() ===
      'No records match these filters',
  $('.report-detail-empty span')?.textContent,
)
check(
  'the empty state says how many records the period really holds',
  $('.report-detail-empty small')?.textContent.includes(
    '2 records in this period',
  ),
  $('.report-detail-empty small')?.textContent,
)
check(
  'the generic "No orders in this period" is NOT shown here',
  !$('.report-detail-panel')?.textContent.includes('No orders in this period'),
)
click($('.report-detail-empty .report-detail-clear'))
await sleep(250)
check(
  "Clear from the empty state restores the period's rows",
  rows().length === 2 &&
    $('.table-pagination-count').textContent.trim() === 'Showing 1–2 of 2',
  `${rows().length} rows`,
)
await pickPreset('This month')
await sleep(250)

// ------------------------------------------------------- the full Clear all
openFilters()
await sleep(50)
setSelect(panelSelect('Payment'), 'KHQR')
await sleep(200)
click(
  $$('.report-filter-panel-actions button').find((b) =>
    b.textContent.includes('Clear all'),
  ),
)
await sleep(200)
check(
  'Clear all inside the popover restores the full period',
  $('.table-pagination-count').textContent.trim() === 'Showing 1–30 of 30',
  $('.table-pagination-count').textContent,
)
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
await sleep(100)

// ----------------------------------------------------------- free-text search
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
  $$('.export-preview-formats button')
    .map((b) => b.textContent.trim())
    .join(',') === 'Word,Excel,CSV' &&
    $$('.export-preview-language button').length === 2,
  $$('.export-preview-formats button')
    .map((b) => b.textContent.trim())
    .join(','),
)
check(
  'the export dialog lives at the body root (portaled, cannot be trapped)',
  $('.export-preview-card')?.parentElement?.parentElement ===
    window.document.body,
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
openReportTab('Payments')
await sleep(250)
check(
  'the Payments tab gets the same drill-down list',
  $('.report-detail-table') !== null,
)
openReportTab('Products')
await sleep(250)
check(
  'the Products tab browses individual sold line items, not orders',
  $$('.report-detail-table thead th')
    .map((th) => th.textContent.trim())
    .join(',') ===
    'Date & time,Order,Product,Category,Units,Unit price (USD),Line total (USD),Status',
  $$('.report-detail-table thead th')
    .map((th) => th.textContent.trim())
    .join(','),
)
openReportTab('Waste')
await sleep(250)
check(
  'the Waste tab browses recorded waste events',
  rows().length === 3 &&
    $$('.report-detail-table thead th')[1].textContent.trim() === 'Product',
  `${rows().length} rows`,
)
openFilters()
await sleep(50)
setSelect(panelSelect('Reason'), 'Damaged')
await sleep(200)
check(
  'waste records filter by reason',
  rows().length === 1 && cell(rows()[0], 4) === 'Damaged',
  `${rows().length} rows`,
)
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
openReportTab('Losses')
await sleep(300)
check(
  'Losses reuses the same paginated table style (5 money rows)',
  rows().length === 5 &&
    $('.table-pagination-count')?.textContent.trim() === 'Showing 1–5 of 5',
  `${rows().length} rows / ${$('.table-pagination-count')?.textContent}`,
)
check(
  'the losses rows are the five loss categories',
  ['Waste', 'Discounts', 'Voids', 'Refunds', 'Cash shortages'].every((label) =>
    rows().some((row) => cell(row, 0) === label),
  ),
  rows()
    .map((row) => cell(row, 0))
    .join(','),
)
openReportTab('Shifts')
await sleep(300)
check(
  'Shifts reuses the same table style with the closed shifts of the range',
  rows().length === 2 &&
    $('.table-pagination-count')?.textContent.trim() === 'Showing 1–2 of 2',
  `${rows().length} rows`,
)
check(
  'shift rows drill through to the Shifts page and their employees',
  $$('.report-detail-table .record-link').length === 4,
  String($$('.report-detail-table .record-link').length),
)
openReportTab('Audit log')
await sleep(300)
check(
  'the Audit log reuses the same paginated table style',
  rows().length === 3 &&
    $('.table-pagination-count')?.textContent.trim() === 'Showing 1–3 of 3',
  `${rows().length} rows / ${$('.table-pagination-count')?.textContent}`,
)
check(
  'audit rows link to their order and employee records',
  $$('.report-detail-table .record-link').length === 5,
  String($$('.report-detail-table .record-link').length),
)
openReportTab('Sales')
await sleep(300)
check(
  'order ids in the Sales table drill through to the order',
  $$('.report-detail-table .record-link').length > 0,
  String($$('.report-detail-table .record-link').length),
)

console.log(
  failures === 0
    ? '\nALL REPORT-DETAIL CHECKS PASSED'
    : `\n${failures} CHECK(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
