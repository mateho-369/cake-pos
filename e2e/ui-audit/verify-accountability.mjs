/**
 * Targeted verification: renders the REAL admin app against the mocked API,
 * opens Reports > Team and Reports > Audit log, and asserts the
 * accountability data (cash-variance flags, discounts, voids, audit events)
 * and the pending-orders panel actually render.
 *
 * Usage: node e2e/ui-audit/verify-accountability.mjs
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
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('http://api.cake.test') },
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
  JSON.stringify({ id: 1, name: 'Makara Piseth', email: 'owner@atelier.local', role: 'admin' }),
)
window.sessionStorage.setItem('atelier.language', 'en')
for (const key of [
  'document', 'navigator', 'HTMLElement', 'HTMLAnchorElement', 'HTMLInputElement',
  'Element', 'Node', 'SVGElement', 'CustomEvent', 'MouseEvent', 'KeyboardEvent',
  'InputEvent', 'Event', 'EventTarget', 'getComputedStyle', 'requestAnimationFrame',
  'cancelAnimationFrame', 'MessageChannel', 'localStorage', 'sessionStorage',
  'Blob', 'File', 'FileReader', 'FormData', 'Headers', 'AbortController',
  'ResizeObserver', 'IntersectionObserver', 'DOMParser', 'MutationObserver',
]) {
  if (window[key] !== undefined) {
    try { window[key] && (globalThis[key] = window[key]) } catch {}
  }
}
globalThis.window = window
window.URL.createObjectURL = () => 'blob:mock'
window.URL.revokeObjectURL = () => {}
window.HTMLAnchorElement.prototype.click = function () {}
window.confirm = () => true

const cashiersPayload = [
  {
    cashier_id: 2, name: 'Sophea Chan', completedOrderCount: 5,
    netRevenueCents: 25000, discountsCents: 3000, discountCount: 4,
    voidCount: 2, voidAmountCents: 1500, refundCount: 1, refundAmountCents: 800,
    shiftsClosed: 3, shortfallCount: 2, repeatedShortfall: true,
    varianceHistory: [
      { closedAt: '2026-08-26T17:30:00Z', openingCashUsdCents: 10000, expectedCashUsdCents: 12000, closingCashUsdCents: 11800, varianceUsdCents: -200 },
      { closedAt: '2026-08-27T17:30:00Z', openingCashUsdCents: 10000, expectedCashUsdCents: 12000, closingCashUsdCents: 11500, varianceUsdCents: -500 },
    ],
  },
]
const auditPayload = [
  { id: 3, at: '2026-08-27T10:00:00Z', employee: 'Makara Piseth', employeeId: 1, action: 'order.voided', orderId: 'CS-77', details: { amountCents: 1500, originalTotalCents: 2000 }, ip: '1.2.3.4' },
  { id: 2, at: '2026-08-27T09:15:00Z', employee: 'Sophea Chan', employeeId: 2, action: 'discount.applied', orderId: 'CS-1001', details: { discountAmountCents: 300, totalCents: 1700 }, ip: '1.2.3.4' },
  { id: 1, at: '2026-08-27T08:00:00Z', employee: 'Sophea Chan', employeeId: 2, action: 'shift.opened', orderId: null, details: { openingCashUsdCents: 10000 }, ip: '1.2.3.4' },
]
const pendingPayload = [
  { id: 'TG-9', pickupCode: 'K7QZ', isStale: true, createdAt: '2026-08-26T09:00:00Z', status: 'Confirmed', total: 34, detail: ['Matcha Pistachio Cake × 1'], customer: { name: 'Srey Neang', phone: '+855 12 345 678' } },
]

window.fetch = async (url) => {
  const p = new URL(String(url)).pathname
  const body = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })
  if (p === '/api/reports/cashiers') return body(cashiersPayload)
  if (p === '/api/reports/audit') return body(auditPayload)
  if (p === '/api/orders/pending') return body(pendingPayload)
  if (p === '/api/reports/retention') return body({ customersWithOrders: 3, newCustomers: 1, returningCustomers: 2, repeatRatePercent: 67, repeatCustomers: 2, customers: [] })
  // Minimal fallbacks for the data-provider's parallel load.
  if (p.endsWith('/products')) return body([])
  if (p.endsWith('/categories')) return body([])
  if (p.endsWith('/orders')) return body([])
  if (p.endsWith('/employees')) return body([{ id: 1, name: 'Makara Piseth', initials: 'MP', role: 'Owner · Admin', status: 'Active', shift: 'No shift recorded', sales: 0, orders: 0 }, { id: 2, name: 'Sophea Chan', initials: 'SC', role: 'Cashier', status: 'Active', shift: 'No shift recorded', sales: 0, orders: 0 }])
  if (p.endsWith('/customers')) return body([])
  if (p.endsWith('/shifts')) return body([])
  if (p.endsWith('/shifts/current')) return body(null)
  if (p === '/api/reports/summary') return body({ todaySalesTotal: 250, todayOrdersCount: 5, netRevenueCents: 25000, completedOrderCount: 5, revenueData: [], topProducts: [] })
  if (p === '/api/reports/freshness') return body({ wasteThisWeekCents: 0 })
  if (p === '/api/settings/pos-rules') return body({ defaultShelfLifeDays: 3 })
  return body(null)
}
globalThis.fetch = window.fetch
globalThis.Response = Response

const { createRequire } = await import('node:module')
createRequire(import.meta.url)(join(outDir, 'entry.cjs'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) failures++
}

await sleep(450)
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
const nav = (label) => {
  const item = [...window.document.querySelectorAll('.sidebar-nav .nav-item')].find((b) => b.textContent.includes(label))
  if (item) click(item)
}

// --- Orders page: pending panel ---
nav('Sales & orders')
await sleep(250)
const ordersText = window.document.querySelector('.page-content').textContent
check('pending panel shows pickup code K7QZ', ordersText.includes('K7QZ'))
check('pending panel shows customer name', ordersText.includes('Srey Neang'))
check('pending panel shows phone', ordersText.includes('+855 12 345 678'))
check('pending panel flags stale order', /STALE/i.test(ordersText))
check('pending panel has Take payment', ordersText.includes('Take payment'))

// --- Customers page: retention strip ---
nav('Customers')
await sleep(250)
const custText = window.document.querySelector('.page-content').textContent
check('retention strip shows repeat rate 67%', custText.includes('67%'))

// --- Reports > Team (accountability) ---
nav('Reports')
await sleep(200)
// The tab strip is gone: reports are picked from the sidebar dropdown.
const openReportTab = async (label) => {
  const navBtn = [...window.document.querySelectorAll('.sidebar-nav .nav-item')].find((b) => b.textContent.includes('Reports'))
  if (navBtn && navBtn.getAttribute('aria-expanded') !== 'true') {
    click(navBtn)
    await sleep(120) // let React render the dropdown before querying it
  }
  const item = [...window.document.querySelectorAll('.nav-submenu-item')].find((b) => b.textContent.trim() === label)
  if (item) click(item)
}
await openReportTab('Team')
await sleep(250)
const teamText = window.document.querySelector('.page-content').textContent
check('team tab shows cashier name', teamText.includes('Sophea Chan'))
check('team tab shows discounts 4 · $30.00', teamText.includes('4 · $30.00'))
check('team tab shows voids 2 · $15.00', teamText.includes('2 · $15.00'))
check('team tab flags repeated shortfall', /2 cash-short closes/i.test(teamText))
// Expand variance history
const historyBtn = [...window.document.querySelectorAll('button')].find((b) => b.textContent.includes('Variance history'))
check('variance history toggle present', Boolean(historyBtn))
if (historyBtn) { click(historyBtn); await sleep(150) }
const teamText2 = window.document.querySelector('.page-content').textContent
check('variance history shows expected cash $120.00', teamText2.includes('$120.00'))
check('variance history shows negative variance', teamText2.includes('$2.00') || teamText2.includes('$5.00'))

// --- Reports > Audit log ---
await openReportTab('Audit log')
await sleep(250)
const auditText = window.document.querySelector('.page-content').textContent
check('audit log shows void event', auditText.includes('order.voided'))
check('audit log shows discount event', auditText.includes('discount.applied'))
check('audit log shows shift.opened', auditText.includes('shift.opened'))
check('audit log shows acting employee', auditText.includes('Sophea Chan'))
check('audit log shows order reference', auditText.includes('CS-1001'))

console.log(failures === 0 ? '\nALL ACCOUNTABILITY CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
