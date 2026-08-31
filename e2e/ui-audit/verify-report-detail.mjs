/**
 * Targeted verification of the Reports redesign — one report style for
 * every tab. Renders the REAL admin app against a mocked API and asserts:
 *
 *  - the download library is gone; the sidebar Reports dropdown lists the
 *    8 report views only;
 *  - date presets are VISIBLE PILL BUTTONS (six plus None) with a manual
 *    refresh control beside the date inputs;
 *  - each summary tab carries a "View by" dropdown (not pills) rendering
 *    the same 3-column shape (Day | Orders | Net sales, Product | Units |
 *    Net sales, …);
 *  - rows QuickZoom: drilling a day/hour/method/employee/reason opens the
 *    record table behind the number, with a back chip;
 *  - the record tables still sort, filter (chips + filter-aware empty
 *    state), search and paginate 25/50/100/All;
 *  - the Export button sits BELOW the breakdown table and opens a
 *    Word/Excel menu that exports exactly what is shown.
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
  const parsed = new URL(String(url))
  const p = parsed.pathname
  const qFrom = parsed.searchParams.get('from')
  const qTo = parsed.searchParams.get('to')
  const inRange = (order) =>
    (!qFrom || order.date >= qFrom) && (!qTo || order.date <= qTo)
  const body = (o) =>
    new Response(JSON.stringify(o), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  if (p === '/api/orders') return body(ordersPayload)
  if (p === '/api/reports/cashiers')
    return body([
      {
        cashier_id: 1,
        name: 'Sophea Chan',
        completedOrderCount: 20,
        netRevenueCents: 20000,
        discountsCents: 3000,
        discountCount: 4,
        voidCount: 2,
        voidAmountCents: 1500,
        refundCount: 0,
        refundAmountCents: 0,
        shiftsClosed: 2,
        shortfallCount: 2,
        repeatedShortfall: true,
        varianceHistory: [
          {
            closedAt: at(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
              15,
              0,
            ),
            openingCashUsdCents: 10000,
            expectedCashUsdCents: 20000,
            closingCashUsdCents: 19000,
            varianceUsdCents: -1000,
          },
        ],
      },
      {
        cashier_id: 2,
        name: 'Vibol Sok',
        completedOrderCount: 10,
        netRevenueCents: 10000,
        discountsCents: 0,
        discountCount: 0,
        voidCount: 0,
        voidAmountCents: 0,
        refundCount: 0,
        refundAmountCents: 0,
        shiftsClosed: 2,
        shortfallCount: 0,
        repeatedShortfall: false,
        varianceHistory: [],
      },
    ])
  if (p === '/api/reports/revenue-trend')
    return body(
      [...thisMonth, ...lastMonth]
        .filter((o) => o.status === 'Completed' && inRange(o))
        .reduce((acc, o) => {
          const period = o.date
          const row = acc.find((r) => r.period === period)
          if (row) row.netRevenueCents += Math.round(o.total * 100)
          else acc.push({ period, netRevenueCents: Math.round(o.total * 100) })
          return acc
        }, [])
        .sort((a, b) => a.period.localeCompare(b.period)),
    )
  if (p === '/api/reports/peak-hours')
    return body(
      [...thisMonth, ...lastMonth]
        .filter((o) => o.status === 'Completed' && inRange(o))
        .reduce((acc, o) => {
          const hour = new Date(o.createdAt).getHours()
          const row = acc.find((r) => r.hour === hour)
          if (row) {
            row.orders += 1
            row.revenueCents += Math.round(o.total * 100)
          } else {
            acc.push({
              hour,
              orders: 1,
              revenueCents: Math.round(o.total * 100),
            })
          }
          return acc
        }, [])
        .sort((a, b) => a.hour - b.hour),
    )
  if (p === '/api/reports/categories')
    return body([
      {
        category: 'Cakes',
        units: 15 * 3,
        netRevenueCents: 15 * 300,
        orders: 15,
      },
      {
        category: 'Pastries',
        units: 15 * 3,
        netRevenueCents: 15 * 300,
        orders: 15,
      },
    ])
  if (p === '/api/reports/customers')
    return body(
      thisMonth
        .filter((o) => o.customer)
        .slice(0, 5)
        .map((o, i) => ({
          customer_id: i + 1,
          orders: 1,
          netRevenueCents: Math.round(o.total * 100),
          lastOrderAt: o.createdAt,
        })),
    )
  if (p === '/api/reports/products')
    return body([
      {
        product_id: 1,
        snapshotName: 'Matcha Cake',
        quantity: 45,
        netRevenueCents: 4500,
      },
      {
        product_id: 2,
        snapshotName: 'Choco Tart',
        quantity: 45,
        netRevenueCents: 4500,
      },
    ])
  if (p === '/api/reports/payments')
    return body([
      { method: 'Cash', transactions: 15, amount_usd_cents: 4500 },
      { method: 'KHQR', transactions: 15, amount_usd_cents: 4500 },
    ])
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

// ----------------------------------------------- presets are visible pills
check(
  'date presets are visible pill buttons above the table (dropdown is gone)',
  $('.report-presets') !== null && $('.report-date-trigger') === null,
  $$('.report-presets button')
    .map((b) => b.textContent.trim())
    .join(','),
)
check(
  'the pill strip lists the six presets plus None',
  $$('.report-presets button')
    .map((b) => b.textContent.trim())
    .join(',') ===
    'Today,Yesterday,This week,This month,Last month,This year,None',
)
const pickPill = (label) => {
  const pill = $$('.report-presets button').find(
    (b) => b.textContent.trim() === label,
  )
  if (pill) click(pill)
}
check(
  'a manual refresh control sits next to the date inputs',
  $('.report-refresh') !== null,
)
click($('.report-refresh'))
await sleep(250)
check(
  'refresh re-runs the current view without resetting it',
  $('.report-viewby-section') !== null &&
    $('.view-by-trigger')?.textContent.includes('View by: Day'),
)

// ------------------------------------------------ the View-by dropdown
const viewTrigger = () => $('.view-by-trigger')
const openViewBy = () => {
  const trigger = viewTrigger()
  if (trigger && trigger.getAttribute('aria-expanded') !== 'true')
    click(trigger)
}
const pickView = async (label) => {
  openViewBy()
  await sleep(80)
  const item = $$('.view-by-menu button').find(
    (b) => b.textContent.trim() === label,
  )
  if (item) click(item)
  await sleep(250)
}
check(
  'the tab has a "View by" dropdown (not pills), defaulting to Day',
  viewTrigger()?.textContent.replace(/\s+/g, ' ').trim() === 'View by: Day',
  viewTrigger()?.textContent.replace(/\s+/g, ' ').trim(),
)
openViewBy()
await sleep(80)
check(
  'the Sales view menu offers Day, Hour, Category, Customer, Product',
  $$('.view-by-menu button')
    .map((b) => b.textContent.trim())
    .join(',') === 'Day,Hour,Category,Customer,Product',
  $$('.view-by-menu button')
    .map((b) => b.textContent.trim())
    .join(','),
)
check(
  'the trigger exposes aria-expanded while the menu is open',
  viewTrigger()?.getAttribute('aria-expanded') === 'true',
)
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
await sleep(80)
check('Escape closes the view menu', $('.view-by-menu') === null)

// ------------------------------------------------ Day view: 3-column shape
const headerText = () =>
  $$('.report-detail-table thead th')
    .map((th) => th.textContent.trim())
    .join(',')
check(
  'the Day breakdown is the same 3-column shape: Day | Orders | Net sales',
  headerText() === 'Day,Orders,Net sales',
  headerText(),
)
check(
  'This month holds exactly one trading day in the fixtures',
  rows().length === 1 &&
    $('.table-pagination-count')?.textContent.trim() === 'Showing 1–1 of 1',
  `${rows().length} rows / ${$('.table-pagination-count')?.textContent}`,
)
check(
  'the Day column is a QuickZoom link',
  $$('.report-detail-table .record-link').length === 1,
  String($$('.report-detail-table .record-link').length),
)
pickPill('None')
await sleep(300)
check(
  'the None pill clears the date filter (both trading days show)',
  rows().length === 2 &&
    $('.table-pagination-count')?.textContent.trim() === 'Showing 1–2 of 2',
  `${rows().length} rows / ${$('.table-pagination-count')?.textContent}`,
)
pickPill('This month')
await sleep(300)
check(
  'the This month pill restores the single day',
  rows().length === 1,
  `${rows().length} rows`,
)

// ------------------------------------------------ QuickZoom: drill a day
click($$('.report-detail-table .record-link')[0])
await sleep(300)
check(
  'drilling a day opens the record table behind it with a back chip',
  $('.drill-back') !== null && $$('.report-detail-table thead th').length === 9,
  `${$$('.report-detail-table thead th').length} cols`,
)
check(
  "the drilled table lists that day's orders (30 here)",
  $('.table-pagination-count')?.textContent.trim() === 'Showing 1–25 of 30',
  $('.table-pagination-count')?.textContent,
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

// ------------------------------------------- the drilled table paginates
check(
  'first page is capped at 25 rows (not an unbounded dump)',
  rows().length === 25,
  String(rows().length),
)
check(
  'counter shows the range and the total for the drilled day',
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
  '"All" shows every order in the drilled day on one page',
  rows().length === 30 &&
    $('.table-pagination-count').textContent.trim() === 'Showing 1–30 of 30',
  `${rows().length} rows`,
)

// ------------------------------------------------------- drilled sorting
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

// ------------------------------------------------ the drilled filter popover
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

// ------------------------------- a stale filter can no longer lie
// (A search that matches nothing is a filter like any other: the empty
// state must say the FILTERS match nothing, with the real row count,
// never "no records in this period".)
typeSearch('ZZZ-NO-MATCH')
await sleep(200)
check(
  'an impossible filter shows the FILTER-aware empty state',
  $('.report-detail-empty') !== null &&
    window.document.body.textContent.includes('match'),
)
check(
  'the empty state says how many records the period really holds',
  window.document.body.textContent.includes('30 records in this period'),
)
check(
  'the generic "No orders in this period" is NOT shown here',
  !window.document.body.textContent.includes('No orders in this period'),
)
click($('.report-detail-clear'))
await sleep(200)
check(
  'Clear from the empty state restores the drilled rows',
  rows().length === 30,
  `${rows().length} rows`,
)
typeSearch('CS-110')
await sleep(200)
check(
  'free-text search matches across the record columns',
  rows().length === 1,
  `${rows().length} rows`,
)
typeSearch('')
await sleep(200)

// ------------------------------------------ the drilled table exports
check(
  'the record table keeps ONE Export button opening a Word/Excel menu',
  $('.report-detail-panel .export-menu') !== null &&
    button('Export') !== undefined &&
    button('Word') === undefined &&
    button('Excel') === undefined,
)
click($('.report-detail-panel .export-menu > button'))
await sleep(100)
check(
  'the menu offers exactly Word and Excel',
  $$('.report-detail-panel .export-menu-list button')
    .map((b) => b.textContent.trim())
    .join(',') === 'Word,Excel',
  $$('.report-detail-panel .export-menu-list button')
    .map((b) => b.textContent.trim())
    .join(','),
)
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
await sleep(80)
check(
  'Escape closes the export menu without downloading',
  $('.report-detail-panel .export-menu-list') === null,
)

// ------------------------------------------------ back to the summary
click($('.drill-back'))
await sleep(250)
check(
  'the back chip returns to the 3-column summary breakdown',
  $('.drill-back') === null && headerText() === 'Day,Orders,Net sales',
  headerText(),
)

// ------------------------------------------------ Hour / Category / Customer / Product
await pickView('Hour')
await sleep(200)
check(
  'Hour view keeps the same shape with hour buckets',
  headerText() === 'Hour,Orders,Net sales' && rows().length >= 1,
  `${headerText()} / ${rows().length} rows`,
)
click($$('.report-detail-table .record-link')[0])
await sleep(250)
check(
  "drilling an hour opens that hour's orders",
  $('.drill-back') !== null &&
    $('.table-pagination-count')?.textContent.trim() === 'Showing 1–25 of 30',
  $('.table-pagination-count')?.textContent,
)
click($('.drill-back'))
await sleep(200)
await pickView('Category')
await sleep(200)
check(
  'Category view: Category | Orders | Net sales with clickable categories',
  headerText() === 'Category,Orders,Net sales' &&
    rows().every(
      (row) => cell(row, 0) === 'Cakes' || cell(row, 0) === 'Pastries',
    ) &&
    $$('.report-detail-table .record-link').length === 2,
  headerText(),
)
await pickView('Customer')
await sleep(200)
check(
  'Customer view: Customer | Orders | Net sales',
  headerText() === 'Customer,Orders,Net sales' && rows().length >= 1,
  headerText(),
)
await pickView('Product')
await sleep(200)
check(
  'Product view swaps Orders for Units',
  headerText() === 'Product,Units,Net sales' &&
    rows().some((row) => cell(row, 0) === 'Matcha Cake'),
  headerText(),
)

// ------------------------------------------------ below-table export menu
await pickView('Day')
await sleep(200)
check(
  'the Export button sits BELOW the breakdown table',
  $('.report-export-row .export-menu') !== null,
)
click($('.report-export-row .export-menu > button'))
await sleep(100)
check(
  'the below-table menu offers exactly Word and Excel',
  $$('.report-export-row .export-menu-list button')
    .map((b) => b.textContent.trim())
    .join(',') === 'Word,Excel',
)
check(
  'the menu trigger exposes aria-expanded while open',
  $('.report-export-row .export-menu > button')?.getAttribute(
    'aria-expanded',
  ) === 'true',
)
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
await sleep(80)
check(
  'Escape closes the below-table menu',
  $('.report-export-row .export-menu-list') === null,
)

// ------------------------------------------ every summary tab gets a View-by
openReportTab('Payments')
await sleep(300)
openViewBy()
await sleep(80)
check(
  'Payments offers By day / By method',
  $$('.view-by-menu button')
    .map((b) => b.textContent.trim())
    .join(',') === 'Day,Method',
)
await pickView('Method')
await sleep(200)
check(
  'Payments Method view lists the two methods',
  headerText() === 'Method,Orders,Net sales' &&
    rows().some((row) => cell(row, 0) === 'Cash') &&
    rows().some((row) => cell(row, 0) === 'KHQR'),
  headerText(),
)
click(
  $$('.report-detail-table .record-link').find(
    (link) => link.textContent.trim() === 'Cash',
  ),
)
await sleep(300)
check(
  "drilling a method opens that method's payment records",
  $('.drill-back') !== null && rows().length === 15,
  `${rows().length} rows`,
)
click($('.drill-back'))
await sleep(200)
openReportTab('Products')
await sleep(300)
openViewBy()
await sleep(80)
check(
  'Products offers By product / By category / By day',
  $$('.view-by-menu button')
    .map((b) => b.textContent.trim())
    .join(',') === 'Product,Category,Day',
)
await pickView('Product')
await sleep(200)
check(
  'Products Product view uses Units, not Orders',
  headerText() === 'Product,Units,Net sales',
  headerText(),
)
openReportTab('Team')
await sleep(300)
openViewBy()
await sleep(80)
check(
  'Team offers By employee / By day',
  $$('.view-by-menu button')
    .map((b) => b.textContent.trim())
    .join(',') === 'Employee,Day',
)
await pickView('Employee')
await sleep(200)
check(
  'Team Employee view lists the two cashiers',
  headerText() === 'Employee,Orders,Net sales' && rows().length === 2,
  headerText(),
)
click(
  $$('.report-detail-table .record-link').find(
    (link) => link.textContent.trim() === 'Sophea Chan',
  ),
)
await sleep(300)
check(
  'drilling an employee shows their accountability block',
  $('.drill-back') !== null &&
    $('.report-viewby-section .accountability-table') !== null &&
    $$('.report-viewby-section .accountability-table .accountability-head')
      .length === 2,
  String(
    $$('.report-viewby-section .accountability-table .accountability-head')
      .length,
  ),
)
check(
  'the drilled employee keeps the anti-theft signals',
  window.document.body.textContent.includes('4 · $30.00') &&
    window.document.body.textContent.includes('2 · $15.00'),
)
click($('.drill-back'))
await sleep(200)
openReportTab('Waste')
await sleep(300)
openViewBy()
await sleep(80)
check(
  'Waste offers By day / By product / By reason',
  $$('.view-by-menu button')
    .map((b) => b.textContent.trim())
    .join(',') === 'Day,Product,Reason',
)
await pickView('Reason')
await sleep(200)
check(
  'Waste Reason view groups the events by reason',
  headerText() === 'Reason,Events,Retail value (USD)' &&
    rows().some((row) => cell(row, 0) === 'Damaged'),
  headerText(),
)
click(
  $$('.report-detail-table .record-link').find(
    (link) => link.textContent.trim() === 'Damaged',
  ),
)
await sleep(300)
check(
  'drilling a reason opens exactly those waste records',
  $('.drill-back') !== null && rows().length === 1,
  `${rows().length} rows`,
)
click($('.drill-back'))
await sleep(200)

// ------------------------------------------ Losses / Shifts / Audit stay tables
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

console.log(
  failures === 0
    ? '\nALL REPORT-DETAIL CHECKS PASSED'
    : `\n${failures} CHECK(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
