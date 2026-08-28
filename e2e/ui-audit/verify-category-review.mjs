/**
 * Targeted verification of the owner's review of a cashier-proposed
 * category: Admin > Categories shows the "Needs review" panel with who
 * proposed it, the row carries the badge, Approve clears the flag and the
 * panel, and Reject is refused while a product still uses the category.
 *
 * Usage: node e2e/ui-audit/verify-category-review.mjs
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
// "Pchum Ben Specials" was proposed by the cashier at the terminal and is
// already in use by one product (so Reject must be refused).
let categories = [
  {
    id: 1,
    name: 'Signature',
    parentId: null,
    parentName: null,
    items: 2,
    active: 2,
    revenue: 68,
    color: '#be185d',
    sortOrder: 0,
  },
  {
    id: 7,
    name: 'Pchum Ben Specials',
    parentId: null,
    parentName: null,
    items: 1,
    active: 1,
    revenue: 0,
    color: '#3b82f6',
    sortOrder: 1,
    pendingReview: true,
    createdBy: 'Sophea Chan',
    createdAt: '2026-08-27T03:15:00.000000Z',
  },
  {
    id: 8,
    name: 'Cofee',
    parentId: null,
    parentName: null,
    items: 0,
    active: 0,
    revenue: 0,
    color: '#d97706',
    sortOrder: 2,
    pendingReview: true,
    createdBy: 'Dara Lim',
    createdAt: '2026-08-27T04:00:00.000000Z',
  },
]
const requests = []

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
  // Owner review. Mirrors the backend: approve clears the flag; reject is
  // refused (422) while an active product still uses the category, otherwise
  // the category is deactivated and drops out of the list.
  const review = p.match(/^\/api\/categories\/(\d+)\/review$/)
  if (method === 'POST' && review) {
    const id = Number(review[1])
    const target = categories.find((c) => c.id === id)
    if (!body || !['approve', 'reject'].includes(body.action)) {
      return json(
        {
          message: 'The given data was invalid.',
          errors: { action: ['action must be "approve" or "reject"'] },
        },
        422,
      )
    }
    if (body.action === 'reject' && (target?.active ?? 0) > 0) {
      return json(
        {
          message:
            '1 active product(s) still use this category — move them to another category first',
          errors: {
            category: [
              '1 active product(s) still use this category — move them to another category first',
            ],
          },
        },
        422,
      )
    }
    if (body.action === 'approve') {
      target.pendingReview = false
      return json({ ...target })
    }
    categories = categories.filter((c) => c.id !== id)
    return json({ ...target, pendingReview: false, active: false })
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
const pageText = () =>
  ($('.page-content')?.textContent || '').replace(/\s+/g, ' ')
const click = (el) =>
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
const buttonByText = (needle) =>
  $$('button').find((b) =>
    (b.textContent || '').replace(/\s+/g, ' ').trim().includes(needle),
  )

await sleep(500)
const nav = (label) => {
  const item = $$('.sidebar-nav .nav-item').find((b) =>
    b.textContent.includes(label),
  )
  if (item) click(item)
}
nav('Categories')
await sleep(300)

// ---------------------------------------------------------- review panel
check(
  'review panel is rendered when a category needs review',
  $('.category-review-card') !== null,
)
const panelText = ($('.category-review-card')?.textContent || '')
  .replace(/\s+/g, ' ')
  .trim()
check(
  'panel lists the proposed category',
  panelText.includes('Pchum Ben Specials'),
  panelText.slice(0, 120),
)
check('panel says who proposed it', /Proposed by Sophea Chan/.test(panelText))
check(
  'panel shows the proposal time',
  panelText.includes(new Date('2026-08-27T03:15:00.000000Z').toLocaleString()),
  panelText.slice(0, 200),
)
check(
  'panel shows both proposals',
  panelText.includes('Pchum Ben Specials') && panelText.includes('Cofee'),
)

// ------------------------------------------------------------- row badge
const badges = $$('.pending-review-badge').map((b) => b.textContent.trim())
check(
  'each pending category row carries the badge',
  badges.length === 2,
  badges.join(' | '),
)
check(
  'badge reads "Needs review"',
  badges.every((b) => /Needs review/i.test(b)),
  badges.join(' | '),
)

// ------------------------------------------------- reject is refused (in use)
const rows = $$('.review-row')
const pchumRow = rows.find((r) => r.textContent.includes('Pchum Ben Specials'))
click(
  [...pchumRow.querySelectorAll('button')].find((b) =>
    b.textContent.includes('Reject'),
  ),
)
await sleep(300)
const rejectedCall = requests.find(
  (r) => r.p.includes('/review') && r.body?.action === 'reject',
)
check(
  'reject issued a review call',
  Boolean(rejectedCall),
  JSON.stringify(rejectedCall),
)
check(
  'the API refused to reject a category still in use',
  /still use this category/.test(pageText()) ||
    /still use this category/.test($('.toast-message')?.textContent || ''),
)
check(
  'the category is still listed after the refused reject',
  pageText().includes('Pchum Ben Specials'),
)

// --------------------------------------------------------------- approve
const stillRow = $$('.review-row').find((r) =>
  r.textContent.includes('Pchum Ben Specials'),
)
click(
  [...stillRow.querySelectorAll('button')].find((b) =>
    b.textContent.includes('Approve'),
  ),
)
await sleep(400)
const approveCall = requests.find(
  (r) => r.p === '/api/categories/7/review' && r.body?.action === 'approve',
)
check(
  'approve posted to the review endpoint',
  Boolean(approveCall),
  JSON.stringify(approveCall),
)
const panelAfter = ($('.category-review-card')?.textContent || '')
  .replace(/\s+/g, ' ')
  .trim()
check(
  'approved category left the review panel',
  !panelAfter.includes('Pchum Ben Specials'),
  panelAfter.slice(0, 120),
)
check('the other proposal is still pending', panelAfter.includes('Cofee'))
check(
  'badge count dropped to one',
  $$('.pending-review-badge').length === 1,
  String($$('.pending-review-badge').length),
)
check(
  'the approved category is still in the list',
  pageText().includes('Pchum Ben Specials'),
)

// ----------------------------------------------- reject an unused one works
const cofeeRow = $$('.review-row').find((r) => r.textContent.includes('Cofee'))
click(
  [...cofeeRow.querySelectorAll('button')].find((b) =>
    b.textContent.includes('Reject'),
  ),
)
await sleep(400)
const rejectUnused = requests.find(
  (r) => r.p === '/api/categories/8/review' && r.body?.action === 'reject',
)
check('reject posted for the unused category', Boolean(rejectUnused))
check('rejected category is gone from the list', !pageText().includes('Cofee'))
check(
  'review panel disappears once nothing is pending',
  $('.category-review-card') === null,
)

console.log(
  failures === 0
    ? '\nALL CATEGORY REVIEW CHECKS PASSED'
    : `\n${failures} CHECK(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
