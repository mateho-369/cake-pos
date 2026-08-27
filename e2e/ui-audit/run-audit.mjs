/**
 * Admin UI audit harness — renders the REAL admin app in jsdom against a
 * mocked API, then click-throughs every page, modal, and button, reporting
 * which buttons have no observable effect. Also dumps each page's rendered
 * text/DOM for offline inspection (e.g. copy-paste artifacts).
 *
 * Usage: node e2e/ui-audit/run-audit.mjs [--page media]
 */
import { build } from 'esbuild'
import { JSDOM, VirtualConsole } from 'jsdom'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as fx from './fixtures.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'e2e/ui-audit/out')
mkdirSync(outDir, { recursive: true })

// ---------------------------------------------------------------- bundle
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
  loader: { '.png': 'dataurl', '.jpg': 'dataurl' },
  logLevel: 'silent',
})

// ---------------------------------------------------------------- jsdom
const virtualConsole = new VirtualConsole()
virtualConsole.on('jsdomError', (err) =>
  console.log('[jsdomError]', err.message.split('\n')[0]),
)
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:4173/',
  pretendToBeVisual: true,
  virtualConsole,
})
const { window } = dom

// Session state: logged-in admin, English UI.
window.sessionStorage.setItem('atelier.authToken', 'audit-token')
window.sessionStorage.setItem(
  'atelier.employee',
  JSON.stringify({ id: 1, name: 'Makara Piseth', email: 'owner@atelier.local', role: 'admin' }),
)
window.sessionStorage.setItem('atelier.language', 'en')

// Globals React and the app code expect.
for (const key of [
  'document', 'navigator', 'HTMLElement', 'HTMLAnchorElement', 'HTMLInputElement',
  'Element', 'Node', 'SVGElement', 'CustomEvent', 'MouseEvent', 'KeyboardEvent',
  'InputEvent', 'Event', 'EventTarget', 'getComputedStyle', 'requestAnimationFrame',
  'cancelAnimationFrame', 'MessageChannel', 'localStorage', 'sessionStorage',
  'Blob', 'File', 'FileReader', 'FormData', 'Headers', 'AbortController',
  'ResizeObserver', 'IntersectionObserver', 'DOMParser', 'MutationObserver',
]) {
  if (window[key] !== undefined) {
    try {
      globalThis[key] = window[key]
    } catch {
      Object.defineProperty(globalThis, key, {
        value: window[key],
        writable: true,
        configurable: true,
      })
    }
  }
}
globalThis.window = window
if (!window.ResizeObserver) {
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  globalThis.ResizeObserver = window.ResizeObserver
}
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }))
window.scrollTo = () => {}
window.open = () => ({ document: { write() {}, open() {}, close() {} }, close() {}, focus() {} })

const auditLog = []
const downloads = []
window.confirm = (msg) => { auditLog.push(`confirm: ${msg}`); return true }
window.prompt = (msg) => { auditLog.push(`prompt: ${msg}`); return 'Audit value' }
window.alert = (msg) => auditLog.push(`alert: ${msg}`)
window.URL.createObjectURL = () => 'blob:mock-object'
window.URL.revokeObjectURL = () => {}
// The bundle's free `URL` reference resolves to Node's global URL, whose
// createObjectURL rejects jsdom Blobs (different realm). Stub it globally so
// export buttons can be exercised.
globalThis.URL.createObjectURL = () => 'blob:mock-object'
globalThis.URL.revokeObjectURL = () => {}
window.HTMLAnchorElement.prototype.click = function () {
  downloads.push(this.download || this.href)
}
if (window.navigator.clipboard === undefined) {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: async (v) => auditLog.push(`clipboard: ${v}`) },
  })
}

// ---------------------------------------------------------------- mock API
const requests = []
let mediaObjects = structuredClone(fx.media.objects)
let categories = structuredClone(fx.categories)

function route(method, url, body) {
  const u = new URL(url, 'http://api.cake.test')
  const p = u.pathname
  const g = (re) => p.match(re)
  if (method === 'GET') {
    if (p === '/api/products') return fx.products
    if (p === '/api/categories') return categories
    if (p === '/api/orders') return fx.orders
    if (p === '/api/employees') return fx.employees
    if (p === '/api/customers') return fx.customers
    if (g(/^\/api\/customers\/\d+\/orders$/)) return [fx.orders[1]]
    if (p === '/api/shifts') return fx.shifts
    if (p === '/api/shifts/current') return fx.currentShift
    if (p === '/api/reports/summary') return fx.summary
    if (p === '/api/reports/freshness') return fx.freshness
    if (p === '/api/reports/cashiers')
      return [
        {
          cashier_id: 2,
          name: 'Sophea Chan',
          completedOrderCount: 1,
          netRevenueCents: 2000,
          discountsCents: 0,
          discountCount: 0,
          voidCount: 0,
          voidAmountCents: 0,
          refundCount: 0,
          refundAmountCents: 0,
          shiftsClosed: 2,
          shortfallCount: 2,
          repeatedShortfall: true,
          varianceHistory: [
            {
              closedAt: '2026-08-26T17:30:00Z',
              openingCashUsdCents: 10000,
              expectedCashUsdCents: 12000,
              closingCashUsdCents: 11800,
              varianceUsdCents: -200,
            },
            {
              closedAt: '2026-08-27T17:30:00Z',
              openingCashUsdCents: 10000,
              expectedCashUsdCents: 12000,
              closingCashUsdCents: 11500,
              varianceUsdCents: -500,
            },
          ],
        },
      ]
    if (p === '/api/reports/audit')
      return [
        {
          id: 2,
          at: '2026-08-27T09:15:00Z',
          employee: 'Sophea Chan',
          employeeId: 2,
          action: 'discount.applied',
          orderId: 'CS-1001',
          details: { discountAmountCents: 150, totalCents: 1850 },
          ip: '127.0.0.1',
        },
        {
          id: 1,
          at: '2026-08-27T08:00:00Z',
          employee: 'Sophea Chan',
          employeeId: 2,
          action: 'shift.opened',
          orderId: null,
          details: { openingCashUsdCents: 10000 },
          ip: '127.0.0.1',
        },
      ]
    if (p === '/api/reports/retention')
      return {
        customersWithOrders: 1,
        newCustomers: 0,
        returningCustomers: 1,
        repeatRatePercent: 100,
        repeatCustomers: 1,
        customers: [],
      }
    if (p === '/api/orders/pending')
      return [
        {
          id: 'TG-9',
          pickupCode: 'K7QZ',
          isStale: true,
          createdAt: '2026-08-26T09:00:00Z',
          status: 'Confirmed',
          total: 34,
          detail: ['Matcha Pistachio Cake × 1'],
          customer: { name: 'Srey Neang', phone: '+855 12 345 678' },
        },
      ]
    if (p === '/api/settings/pos-rules') return fx.posRules
    if (p === '/api/settings/business-profile') return fx.businessProfile
    if (p === '/api/settings/receipt-template') return fx.receiptTemplate
    if (p === '/api/storage/media')
      return { totalBytes: mediaObjects.reduce((s, o) => s + o.size, 0), objects: mediaObjects }
    if (p === '/api/broadcasts') return fx.broadcasts
    if (p === '/api/broadcast-templates') return fx.broadcastTemplates
    if (p === '/api/broadcasts/preview') return { recipientCount: 12 }
    if (g(/^\/api\/receipts\//)) return { html: '<p>receipt</p>' }
  }
  if (method === 'POST') {
    if (p === '/api/login') return { token: 'audit-token', employee: { id: 1, name: 'Makara Piseth', role: 'admin' } }
    if (p === '/api/logout') return { ok: true }
    if (p === '/api/shifts/close') return { ...fx.shifts[0], status: 'Closed' }
    if (p === '/api/products/import') return { created: body.rows || [], skipped: [] }
    if (p === '/api/broadcasts/poster') return { imageUrl: 'http://cdn.test/poster.jpg' }
    if (p === '/api/broadcasts') return { recipientCount: 12 }
    if (p === '/api/broadcast-templates')
      return { id: 99, name: body.name, imageUrl: body.imageUrl, caption: body.caption }
    if (p === '/api/employees') return { id: 9, ...body }
    if (p === '/api/categories') return { id: 9, ...body }
    if (p === '/api/inventory/waste') return { remainingStock: 1 }
    if (g(/^\/api\/orders\/[^/]+\/corrections$/)) return { ...fx.orders[0], id: 'CS-1001-R' }
  }
  if (method === 'PUT') {
    if (g(/^\/api\/broadcast-templates\/\d+$/)) return { id: Number(p.split('/').pop()), ...body }
    if (p === '/api/settings/business-profile') return body
    if (p === '/api/settings/receipt-template') return body
    if (p === '/api/settings/pos-rules') return { ...fx.posRules, ...body }
    if (g(/^\/api\/categories\/\d+$/)) {
      const cat = categories.find((c) => c.id === Number(p.split('/').pop()))
      if (cat) Object.assign(cat, body)
      return cat || { id: Number(p.split('/').pop()), ...body }
    }
    if (g(/^\/api\/products\/\d+$/)) return { ...fx.products[0], ...body }
    if (g(/^\/api\/employees\/\d+$/)) return { id: Number(p.split('/').pop()), ...body }
    if (g(/^\/api\/orders\/[^/]+$/)) return { ...fx.orders[1], ...body }
  }
  if (method === 'DELETE') {
    if (p === '/api/storage/media') {
      const before = mediaObjects.length
      mediaObjects = mediaObjects.filter((o) => !body.keys.includes(o.key))
      return { deleted: before - mediaObjects.length }
    }
    if (g(/^\/api\/products\/\d+$/)) return { message: 'Product deleted', deleted: true }
    if (g(/^\/api\/broadcast-templates\/\d+$/)) return { ok: true }
    if (g(/^\/api\/employees\/\d+$/)) return { ok: true }
    if (g(/^\/api\/categories\/\d+$/)) return { ok: true }
  }
  if (method === 'PATCH') {
    if (g(/^\/api\/orders\//)) return { ...fx.orders[1], ...body }
  }
  throw new Error(`UNMOCKED ${method} ${p}`)
}

window.fetch = async (url, init = {}) => {
  const method = (init.method || 'GET').toUpperCase()
  let body
  try { body = init.body ? JSON.parse(init.body) : undefined } catch { body = undefined }
  requests.push(`${method} ${String(url).replace('http://api.cake.test', '')}`)
  try {
    const payload = route(method, String(url), body)
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    auditLog.push(`FETCH ERROR ${err.message}`)
    return new Response(JSON.stringify({ message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
globalThis.fetch = window.fetch
globalThis.Response = Response

// ---------------------------------------------------------------- mount
const { createRequire } = await import('node:module')
createRequire(import.meta.url)(join(outDir, 'entry.cjs'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const settle = (ms = 120) => sleep(ms)
const $ = (sel) => window.document.querySelector(sel)
const $$ = (sel) => [...window.document.querySelectorAll(sel)]

function labelOf(btn) {
  const text = (btn.textContent || '').replace(/\s+/g, ' ').trim()
  return btn.getAttribute('aria-label') || text || `(icon-only ${btn.className})`
}
function isModalOpen() {
  return $('.modal-layer') !== null
}
function pressEscape() {
  window.document.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  )
}
function closeModals() {
  for (let i = 0; i < 4; i++) {
    const backdrop = $('.modal-backdrop')
    if (!backdrop) break
    backdrop.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  }
}
async function ensureEnglish() {
  const en = $$('.language-toggle button').find((b) => b.textContent.trim() === 'EN')
  if (en && !en.className.includes('active')) {
    en.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await settle(40)
  }
}
const PAGES = [
  ['Overview', 'overview'],
  ['Sales & orders', 'orders'],
  ['Customers', 'customers'],
  ['Product catalog', 'products'],
  ['Freshness & waste', 'freshness'],
  ['Categories', 'categories'],
  ['Team & access', 'employees'],
  ['Shifts & cash', 'shifts'],
  ['Reports', 'reports'],
  ['Settings', 'settings'],
  ['Media Library', 'media'],
]
async function navigate(label) {
  await ensureEnglish()
  const item = $$('.sidebar-nav .nav-item').find((b) => b.textContent.includes(label))
  if (!item) throw new Error(`nav item not found: ${label}`)
  item.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await settle(220)
}

async function clickAndObserve(btn) {
  const reqBefore = requests.length
  const htmlBefore = window.document.body.innerHTML.length
  const toastBefore = $('.toast-message')?.textContent
  const pageBefore = $('.page-heading h1')?.textContent
  const dlBefore = downloads.length
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await settle(90)
  const newReqs = requests.slice(reqBefore)
  const htmlAfter = window.document.body.innerHTML.length
  const toastAfter = $('.toast-message')?.textContent
  const effects = []
  if (newReqs.length) effects.push(`fetch:${newReqs.join(' | ').slice(0, 140)}`)
  if (Math.abs(htmlAfter - htmlBefore) > 40) effects.push('dom-changed')
  if (toastAfter && toastAfter !== toastBefore) effects.push(`toast:${toastAfter.trim().slice(0, 40)}`)
  if (isModalOpen()) effects.push('modal-open')
  if ($('.page-heading h1')?.textContent !== pageBefore) effects.push('navigated')
  if (downloads.length > dlBefore) effects.push('download')
  return effects
}

async function census(selector, where, report, slug) {
  const seen = new WeakSet()
  for (let pass = 0; pass < 60; pass++) {
    await ensureEnglish()
    const buttons = $$(selector).filter((b) => !seen.has(b))
    if (!buttons.length) break
    const btn = buttons[0]
    seen.add(btn)
    const lbl = labelOf(btn).slice(0, 64)
    if (btn.disabled) {
      report.push(`${slug} | ${where} | ${lbl} | disabled (not clickable)`)
      continue
    }
    const effects = await clickAndObserve(btn)
    report.push(`${slug} | ${where} | ${lbl} | ${effects.length ? effects.join(' ; ') : 'NO EFFECT'}`)
    // Reset UI state.
    pressEscape()
    closeModals()
    await settle(40)
  }
}

async function censusModalButtons(report, where) {
  const mSeen = new Set()
  for (let mpass = 0; mpass < 20; mpass++) {
    if (!isModalOpen()) break
    const all = $$('.modal-layer button')
    // Click content buttons first; leave close/backdrop buttons for last so
    // the modal stays open long enough to exercise everything inside it.
    const isClose = (b) =>
      b.classList.contains('modal-backdrop') ||
      (b.getAttribute('aria-label') || '').toLowerCase().includes('close')
    const mb =
      all.find(
        (b, i) => !isClose(b) && !mSeen.has(`${i}:${labelOf(b).slice(0, 32)}`),
      ) ||
      all.find((b, i) => !mSeen.has(`${i}:${labelOf(b).slice(0, 32)}`))
    if (!mb) break
    mSeen.add(`${all.indexOf(mb)}:${labelOf(mb).slice(0, 32)}`)
    const mlbl = labelOf(mb).slice(0, 64)
    if (mb.disabled) {
      report.push(`${where} | modal | ${mlbl} | disabled (not clickable)`)
      if (isClose(mb)) break
      continue
    }
    const meffects = await clickAndObserve(mb)
    report.push(`${where} | modal | ${mlbl} | ${meffects.length ? meffects.join(' ; ') : 'NO EFFECT'}`)
    if (!isModalOpen()) break
  }
}

async function censusPage(label, slug, report) {
  const seen = new Set()
  let needsReset = true
  for (let pass = 0; pass < 80; pass++) {
    if (needsReset) {
      await navigate(label)
      needsReset = false
    }
    await ensureEnglish()
    const htmlBeforeScan = window.document.body.innerHTML.length
    const all = $$('.page-content button')
    const btn = all.find(
      (b, i) => !seen.has(`${i}:${labelOf(b).slice(0, 32)}`),
    )
    if (!btn) break
    const key = `${all.indexOf(btn)}:${labelOf(btn).slice(0, 32)}`
    seen.add(key)
    const lbl = labelOf(btn).slice(0, 64)
    if (btn.disabled) {
      report.push(`${slug} | page | ${lbl} | disabled (not clickable)`)
      continue
    }
    const effects = await clickAndObserve(btn)
    report.push(`${slug} | page | ${lbl} | ${effects.length ? effects.join(' ; ') : 'NO EFFECT'}`)
    const navigatedAway = $('.page-heading h1')?.textContent !== label
    if (isModalOpen()) {
      await censusModalButtons(report, slug)
      pressEscape()
      closeModals()
      await settle(40)
      needsReset = true
      continue
    }
    if (navigatedAway) {
      needsReset = true
      continue
    }
    // If the click shrank the page (e.g. a filter hid rows), reset so hidden
    // buttons become visible again on a fresh mount.
    const htmlNow = window.document.body.innerHTML.length
    if (htmlNow < htmlBeforeScan - 300) needsReset = true
  }
}

async function main() {
  await settle(450) // initial data load
  if (!$('.sidebar-nav')) throw new Error('app did not mount')
  const report = []
  const onlyPage = process.argv.includes('--page')
    ? process.argv[process.argv.indexOf('--page') + 1]
    : null

  // ---- header controls (global, audited once) ----
  for (const sel of ['.topbar .menu-button', '.topbar .search-trigger', '.topbar .notification-button']) {
    const btn = $(sel)
    if (!btn) continue
    const effects = await clickAndObserve(btn)
    report.push(`header | ${sel} | ${labelOf(btn).slice(0, 40)} | ${effects.length ? effects.join(' ; ') : 'NO EFFECT'}`)
    pressEscape()
    closeModals()
    await settle(40)
  }
  // Header "Add cake" opens the quick-add modal; census its buttons too.
  const addBtn = $('.topbar .header-add')
  if (addBtn) {
    const effects = await clickAndObserve(addBtn)
    report.push(`header | add-cake | ${labelOf(addBtn).slice(0, 40)} | ${effects.join(' ; ')}`)
    await censusModalButtons(report, 'header:add-modal')
    pressEscape()
    closeModals()
    await settle(40)
  }
  // Profile menu.
  const profileBtn = $('.topbar .profile-button')
  if (profileBtn) {
    const effects = await clickAndObserve(profileBtn)
    report.push(`header | profile | ${labelOf(profileBtn).slice(0, 40)} | ${effects.join(' ; ')}`)
    const settingsItem = $$('.profile-menu-items button').find((b) => b.textContent.includes('Account settings'))
    if (settingsItem) {
      const e2 = await clickAndObserve(settingsItem)
      report.push(`header | profile-menu:account-settings | ${labelOf(settingsItem).slice(0, 40)} | ${e2.join(' ; ')}`)
    }
    report.push('header | profile-menu:sign-out | Sign out | NOT CLICKED (ends session; wired to POST /api/logout in code)')
    await navigate('Overview')
  }
  // Language toggle.
  for (const b of $$('.language-toggle button')) {
    const effects = await clickAndObserve(b)
    report.push(`header | language-toggle | ${b.textContent.trim()} | ${effects.join(' ; ')}`)
  }
  await ensureEnglish()

  // ---- every page ----
  for (const [label, slug] of PAGES) {
    if (onlyPage && slug !== onlyPage) continue
    await censusPage(label, slug, report)
    const content = $('.page-content')
    writeFileSync(join(outDir, `text-${slug}.txt`), (content?.textContent || '').replace(/[ \t]+/g, ' '))
    writeFileSync(join(outDir, `dom-${slug}.html`), content?.outerHTML || '')
  }

  writeFileSync(join(outDir, 'button-census.txt'), report.join('\n'))
  writeFileSync(join(outDir, 'requests.txt'), requests.join('\n'))
  writeFileSync(join(outDir, 'audit-log.txt'), auditLog.join('\n'))
  writeFileSync(join(outDir, 'downloads.txt'), downloads.join('\n'))
  console.log(report.join('\n'))
  const noEffect = report.filter((r) => r.includes('NO EFFECT'))
  console.log(`\nBUTTONS WITH NO EFFECT: ${noEffect.length}`)
  noEffect.forEach((r) => console.log('  ' + r))
}

main().catch((err) => {
  console.error('HARNESS FAILED', err)
  process.exit(1)
})
