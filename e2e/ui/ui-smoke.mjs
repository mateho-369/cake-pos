/**
 * UI smoke test — drives the REAL built admin/sale/shop apps in headless
 * Chromium against a REAL running backend (PHP + MySQL), the same way a human
 * would click through them. Captures screenshots and performs real download
 * verification for the export buttons.
 *
 * Env:
 *   API_URL     e.g. http://127.0.0.1:8080
 *   ADMIN_URL   e.g. http://localhost:4173
 *   SALE_URL    e.g. http://localhost:4174
 *   SHOP_URL    e.g. http://localhost:4175
 *   BOT_TOKEN   shop Telegram bot token (for signed initData tests)
 */
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash, createHmac } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const artifacts = join(root, 'e2e/ui/artifacts')
mkdirSync(artifacts, { recursive: true })

const API = process.env.API_URL || 'http://127.0.0.1:8080'
const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:4173'
const SALE_URL = process.env.SALE_URL || 'http://localhost:4174'
const SHOP_URL = process.env.SHOP_URL || 'http://localhost:4175'
const BOT_TOKEN = process.env.BOT_TOKEN || ''
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'owner@atelier.local'
const ADMIN_PASS = process.env.ADMIN_PASS || 'ChangeMe123!'
const CASHIER_EMAIL = process.env.CASHIER_EMAIL || 'sophea@atelier.local'
const CASHIER_PASS = process.env.CASHIER_PASS || 'ChangeMe123!'

let failures = 0
const pass = (label) => console.log(`PASS  ${label}`)
const fail = (label, extra = '') => {
  failures++
  console.log(`FAIL  ${label}${extra ? '  — ' + extra : ''}`)
}
const check = (label, cond, extra = '') =>
  cond ? pass(label) : fail(label, extra)

// ---------- API helpers (Node side, same calls the apps make) ----------
async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {}
  return { status: res.status, json }
}

async function login(email, password) {
  const r = await api('/api/login', {
    method: 'POST',
    body: { email, password },
  })
  if (r.status !== 200 || !r.json?.token)
    throw new Error(
      `login failed for ${email}: ${r.status} ${JSON.stringify(r.json)}`,
    )
  return r.json.token
}

function signedInitData(user) {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'smoke-query',
    user: JSON.stringify(user),
  }
  const dataCheckString = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  const hash = createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex')
  return new URLSearchParams({ ...params, hash }).toString()
}

// ---------- Browser ----------
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
// Force the UI language to English for stable assertions.
await page.addInitScript(() => {
  try {
    sessionStorage.setItem('atelier.language', 'en')
  } catch {}
})
page.on('console', (msg) => {
  if (msg.type() === 'error')
    console.log(`  [browser console.error] ${msg.text()}`)
})
page.on('pageerror', (err) =>
  console.log(`  [browser pageerror] ${err.message}`),
)

const shot = (name) =>
  page.screenshot({ path: join(artifacts, `${name}.png`), fullPage: true })

// =====================================================================
console.log('\n########## PHASE A — ADMIN APP ON EMPTY DATABASE ##########')
const adminToken = await login(ADMIN_EMAIL, ADMIN_PASS)
check('admin login via API returns token', adminToken.length > 10)

await page.goto(ADMIN_URL, { waitUntil: 'networkidle' })
await page.getByLabel('Email address').fill(ADMIN_EMAIL)
await page.getByLabel('Password').fill(ADMIN_PASS)
await page.getByRole('button', { name: 'Sign in securely' }).click()
await page.waitForSelector('text=Net sales', { timeout: 30000 })
await shot('admin-overview-empty')

// Sidebar live sales must equal the API value (0 on empty DB)
const sidebarLive = await page.locator('.live-card strong').innerText()
check(
  'sidebar live sales is $0.00 on empty DB',
  sidebarLive.trim() === '$0.00',
  sidebarLive,
)
const navBadges = await page.locator('nav .nav-item em').count()
check('no sidebar badges on empty DB', navBadges === 0, `found ${navBadges}`)

// Overview KPIs
const overviewText = await page.locator('.page-content').innerText()
check('net sales KPI $0.00', overviewText.includes('$0.00'))
check(
  'no KHQR payments today shown',
  overviewText.includes('No KHQR payments today'),
)
check(
  'pace: no prior days to compare',
  overviewText.includes('no prior days to compare'),
)

// Navigate every page in the nav and screenshot each
const nav = [
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
for (const [label, slug] of nav) {
  await page
    .locator('.sidebar-nav .nav-item', { hasText: label })
    .first()
    .click()
  await page.waitForTimeout(700)
  await shot(`admin-${slug}-empty`)
}
await page
  .locator('.sidebar-nav .nav-item', { hasText: 'Overview' })
  .first()
  .click()
await page.waitForTimeout(500)

// Freshness page specifics (all real zeros)
await page
  .locator('.sidebar-nav .nav-item', { hasText: 'Freshness & waste' })
  .first()
  .click()
await page.waitForSelector('text=freshness score', { timeout: 15000 })
const freshnessText = await page.locator('.page-content').innerText()
check('freshness score 0%', freshnessText.includes('0%'))
check('freshness 0 units fresh', freshnessText.includes('0 units'))
check('waste $0.00', freshnessText.includes('$0.00'))
check('no inventory yet state', freshnessText.includes('No inventory yet'))
await page.locator('text=Waste log').click()
await page.waitForTimeout(400)
const wasteText = await page.locator('.page-content').innerText()
check('waste log empty state', wasteText.includes('No waste recorded yet'))

// Shifts page
await page
  .locator('.sidebar-nav .nav-item', { hasText: 'Shifts & cash' })
  .first()
  .click()
await page.waitForTimeout(600)
const shiftsText = await page.locator('.page-content').innerText()
check('shifts: no active shift', shiftsText.includes('No active shift'))
check(
  'shifts: no KHQR payments',
  shiftsText.includes('No KHQR payments in this period'),
)

// Reports page
await page
  .locator('.sidebar-nav .nav-item', { hasText: 'Reports' })
  .first()
  .click()
await page.waitForTimeout(600)
const reportsText = await page.locator('.page-content').innerText()
check(
  'reports: no sales data insight',
  reportsText.includes('No sales data yet'),
)
check('reports: waste $0.00', reportsText.includes('$0.00'))

// Employees page
await page
  .locator('.sidebar-nav .nav-item', { hasText: 'Team & access' })
  .first()
  .click()
await page.waitForTimeout(600)
const empText = await page.locator('.page-content').innerText()
check(
  'employees: 3 team members (real seeded count)',
  empText.includes('3 team members'),
)
check(
  'employees: 0 clocked in',
  empText.includes('0 people currently clocked in.'),
)

// Settings
await page
  .locator('.sidebar-nav .nav-item', { hasText: 'Settings' })
  .first()
  .click()
await page.waitForTimeout(700)
const settingsInputs = await page.locator('.settings-content input').count()
check('settings page rendered inputs', settingsInputs > 5)
await page.locator('text=Receipts').last().click()
await page.waitForTimeout(600)
const receiptText = await page.locator('.settings-content').innerText()
check(
  'receipt preview empty state (no fake CS-1052)',
  receiptText.includes('No orders yet'),
)

// =====================================================================
console.log(
  '\n########## PHASE B — EXPORT BUTTONS (real downloads, empty DB) ##########',
)

// Dashboard CSV export
await page
  .locator('.sidebar-nav .nav-item', { hasText: 'Overview' })
  .first()
  .click()
await page.waitForTimeout(500)
const [csvDl] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Export' }).first().click(),
])
const csvPath = await csvDl.path()
const csvBytes = readFileSync(csvPath)
check(
  'dashboard CSV starts with UTF-8 BOM',
  csvBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
  csvBytes.subarray(0, 3).toString('hex'),
)
const csvText = csvBytes.toString('utf8')
check('CSV headers English (Metric,Value)', csvText.includes('Metric,Value'))
check('CSV net sales 0.00 on empty DB', csvText.includes('Net sales,0.00'))
console.log(`  CSV content: ${csvText.replace(/\n/g, ' | ')}`)

// Orders Excel + Word exports
await page
  .locator('.sidebar-nav .nav-item', { hasText: 'Sales & orders' })
  .first()
  .click()
await page.waitForTimeout(500)
const [xlsxDl] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Excel' }).click(),
])
const xlsxPath = await xlsxDl.path()
const xlsxShared = execSync(`unzip -p "${xlsxPath}" xl/sharedStrings.xml`, {
  encoding: 'utf8',
})
check(
  'xlsx English headers (Order ID / Total (USD))',
  /Order ID/.test(xlsxShared) && /Total \(USD\)/.test(xlsxShared),
)

const [docxDl] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Word' }).click(),
])
const docxPath = await docxDl.path()
const docXml = execSync(`unzip -p "${docxPath}" word/document.xml`, {
  encoding: 'utf8',
})
check(
  'docx is Khmer (title glyphs present)',
  docXml.includes('សេចក្តីសង្ខេបការលក់'),
)
check('docx uses Kantumruy Pro font', /Kantumruy Pro/.test(docXml))
check(
  'docx empty state Khmer "no sales"',
  docXml.includes('គ្មានការលក់ផលិតផលដែលបានបញ្ចប់'),
)

// =====================================================================
console.log(
  '\n########## PHASE C — SEED REAL DATA VIA API, RE-VERIFY UI ##########',
)
const cat = await api('/api/categories', {
  method: 'POST',
  token: adminToken,
  body: { name: 'Smoke Cakes', color: '#be185d', active: true },
})
check('create category 201', cat.status === 201, String(cat.status))
const prod = await api('/api/products', {
  method: 'POST',
  token: adminToken,
  body: { name: 'Smoke Cake', category: 'Smoke Cakes', price: 10, stock: 5 },
})
check('create product 201', prod.status === 201, String(prod.status))

// Category hierarchy + the "unknown category" bug regression: products are
// validated against the REAL categories table, by id first.
const childCat = await api('/api/categories', {
  method: 'POST',
  token: adminToken,
  body: { name: 'Smoke Mini', parentCategoryId: cat.json.id, active: true },
})
check(
  'create subcategory 201 with parentCategoryId',
  childCat.status === 201 && childCat.json.parentId === cat.json.id,
  `${childCat.status} ${JSON.stringify(childCat.json)}`,
)
const brandNewCat = await api('/api/categories', {
  method: 'POST',
  token: adminToken,
  body: { name: 'Brand New Line ' + Date.now(), active: true },
})
const productByNewId = await api('/api/products', {
  method: 'POST',
  token: adminToken,
  body: {
    name: 'Fresh Line Cake',
    categoryId: brandNewCat.json.id,
    price: 12,
    stock: 2,
  },
})
check(
  'product in brand-new admin category is accepted (by id)',
  productByNewId.status === 201,
  `${productByNewId.status} ${JSON.stringify(productByNewId.json)}`,
)
const unknownCat = await api('/api/products', {
  method: 'POST',
  token: adminToken,
  body: { name: 'Bad Cake', category: 'Not A Category', price: 1, stock: 1 },
})
check(
  'unknown category still rejected with 422',
  unknownCat.status === 422,
  String(unknownCat.status),
)
// Deactivation reason codes are enforced + audited.
const noReason = await api('/api/products/' + productByNewId.json.id, {
  method: 'PUT',
  token: adminToken,
  body: { active: false },
})
check(
  'deactivate without reason is refused (422)',
  noReason.status === 422,
  String(noReason.status),
)
const withReason = await api('/api/products/' + productByNewId.json.id, {
  method: 'PUT',
  token: adminToken,
  body: { active: false, reasonCode: 'discontinued', reasonNote: 'smoke test' },
})
check(
  'deactivate with reason succeeds',
  withReason.status === 200,
  String(withReason.status),
)
const auditRows = await api(
  '/api/reports/audit?productId=' +
    productByNewId.json.id +
    '&from=2000-01-01&to=2099-12-31',
  { token: adminToken },
)
check(
  'deactivation reason lands in the audit trail',
  auditRows.status === 200 &&
    auditRows.json.some(
      (r) =>
        r.action === 'product.deactivated' &&
        r.details.reasonCode === 'discontinued',
    ),
  `${auditRows.status}`,
)

const cashierToken = await login(CASHIER_EMAIL, CASHIER_PASS)
const openShift = await api('/api/shifts/open', {
  method: 'POST',
  token: cashierToken,
  body: { openingCash: 100 },
})
check('open shift 201', openShift.status === 201, String(openShift.status))

// Mixed-currency worked example at the API level: $10 paid with $8 + ៛8,200.
const mixedOrder = await api('/api/orders', {
  method: 'POST',
  token: adminToken,
  body: {
    payment: 'Cash',
    items: [{ productId: prod.json.id, quantity: 1 }],
    idempotencyKey: 'ui-smoke-mixed-' + Date.now(),
    usdReceivedCents: 800,
    khrReceived: 8200,
    changeUsdCents: 0,
    changeKhr: 0,
    exchangeRateKhrPerUsd: 4100,
  },
})
check(
  'mixed tender order 201 ($8 + ៛8,200 = $10 exact)',
  mixedOrder.status === 201,
  `${mixedOrder.status} ${JSON.stringify(mixedOrder.json).slice(0, 200)}`,
)
const shiftNow = await api('/api/shifts/current', { token: adminToken })
check(
  'shift expected drawer tracks KHR separately',
  shiftNow.json && typeof shiftNow.json.expectedCashKhr === 'number',
)
const order = await api('/api/orders', {
  method: 'POST',
  token: cashierToken,
  body: {
    payment: 'Cash',
    items: [{ productId: prod.json.id, quantity: 2 }],
    idempotencyKey: 'ui-smoke-order-1',
  },
})
check(
  'create order 201 total 20',
  order.status === 201 && order.json.total === 20,
  `${order.status} ${JSON.stringify(order.json)}`,
)
check(
  'order paymentStatus paid',
  order.json.paymentStatus === 'paid',
  order.json.paymentStatus,
)

await page.goto(ADMIN_URL, { waitUntil: 'networkidle' })
await page.getByLabel('Email address').fill(ADMIN_EMAIL)
await page.getByLabel('Password').fill(ADMIN_PASS)
await page.getByRole('button', { name: 'Sign in securely' }).click()
await page.waitForSelector('text=Net sales', { timeout: 30000 })
await page.waitForTimeout(1200) // data refresh
await shot('admin-overview-seeded')

const sidebarLive2 = await page.locator('.live-card strong').innerText()
check(
  'sidebar live sales $20.00 after real sale',
  sidebarLive2.trim() === '$20.00',
  sidebarLive2,
)
const overview2 = await page.locator('.page-content').innerText()
check('dashboard net sales $20.00', overview2.includes('$20.00'))
check('dashboard order count 1', overview2.includes('1'))
check(
  'dashboard KHQR count text (0 today)',
  overview2.includes('No KHQR payments today'),
)

// Freshness after sale: 3 units remain
await page
  .locator('.sidebar-nav .nav-item', { hasText: 'Freshness & waste' })
  .first()
  .click()
await page.waitForSelector('text=freshness score', { timeout: 15000 })
const freshness2 = await page.locator('.page-content').innerText()
check('freshness 3 units total after sale', freshness2.includes('3 units'))
check('freshness score 100%', freshness2.includes('100%'))

// Shifts: open shift with real float
await page
  .locator('.sidebar-nav .nav-item', { hasText: 'Shifts & cash' })
  .first()
  .click()
await page.waitForTimeout(600)
const shifts2 = await page.locator('.page-content').innerText()
check('shifts shows open shift', shifts2.includes('Open'))
check('shifts expected drawer $120.00', shifts2.includes('$120.00'))

// Orders page shows the real order
await page
  .locator('.sidebar-nav .nav-item', { hasText: 'Sales & orders' })
  .first()
  .click()
await page.waitForTimeout(600)
const orders2 = await page.locator('.page-content').innerText()
check('orders page shows smoke order', orders2.includes(order.json.id))
check('orders page shows $20.00', orders2.includes('20.00'))

// Exports with real data now
const [xlsxDl2] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Excel' }).click(),
])
const xlsx2 = execSync(
  `unzip -p "${await xlsxDl2.path()}" xl/worksheets/sheet1.xml`,
  { encoding: 'utf8' },
)
check('seeded xlsx contains order row', xlsx2.includes(order.json.id))
check('seeded xlsx contains total 20', /<v>20<\/v>/.test(xlsx2))
const [docxDl2] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Word' }).click(),
])
const docXml2 = execSync(
  `unzip -p "${await docxDl2.path()}" word/document.xml`,
  { encoding: 'utf8' },
)
check(
  'seeded docx revenue $20.00 in Khmer',
  docXml2.includes('ចំណូលសរុប៖ $20.00'),
)
check('seeded docx contains product name', docXml2.includes('Smoke Cake'))

// =====================================================================
console.log('\n########## PHASE D — SALE APP ##########')
await page.goto(SALE_URL, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Email' }).click()
await page.waitForTimeout(300)
await page.getByLabel('Email address').fill(CASHIER_EMAIL)
await page.getByLabel('Password').fill(CASHIER_PASS)
await page.getByRole('button', { name: 'Continue' }).click()
await page.waitForSelector('text=What are we serving?', { timeout: 30000 })
await shot('sale-menu')
const menuText = await page.locator('.product-workspace').innerText()
check('sale menu shows the real product', menuText.includes('Smoke Cake'))
check('sale menu shows real stock (3 left)', menuText.includes('3 left'))
check(
  'sale menu near-expiry count is real',
  menuText.includes('Everything is fresh'),
)

// Add to cart and pay by cash
await page.locator('.product-card', { hasText: 'Smoke Cake' }).first().click()
await page.waitForTimeout(400)
await page.locator('.cash-input input').first().fill('30')
await page.waitForTimeout(200)
await page.getByRole('button', { name: /Complete cash/ }).click()
await page.waitForSelector('text=PAYMENT COMPLETE', { timeout: 20000 })
await shot('sale-payment-success')
pass('sale checkout completed with success overlay')

// =====================================================================
console.log('\n########## PHASE D2 — SHIFT INDICATOR + SPLIT TENDER ##########')
// The success overlay covers the screen while "preparing"; wait for it to
// auto-dismiss before touching the terminal UI again.
await page.waitForSelector('.success-layer', {
  state: 'detached',
  timeout: 20000,
})
// Item 11 regression: the header shift indicator must track the SERVER's
// shift state at every step of the cycle, including when it changes from
// another "terminal" (here: the API) while this one sits idle.
{
  const badge = page.locator('.shift-status')
  check(
    'shift badge shows Open after login (server-open shift)',
    (await badge.getAttribute('class')).includes('open'),
  )
  check(
    'shift badge text says Shift open',
    (await badge.innerText()).includes('Shift open'),
  )

  // --- Split tender: $10 item paid with $8 USD + ៛8,200 (rate 4100) ---
  await page.locator('.product-card', { hasText: 'Smoke Cake' }).first().click()
  await page.waitForTimeout(400)
  const usdInput = page.locator('.cash-input input').first()
  const khrInput = page.locator('.cash-input.khr input').first()
  await usdInput.fill('8')
  await khrInput.fill('8200')
  await page.waitForTimeout(250)
  const tenderText = await page.locator('.tender-summary').innerText()
  check(
    'split tender total received shows $10.00',
    tenderText.includes('$10.00'),
    tenderText.replace(/\n/g, ' '),
  )
  check(
    'split tender shows no "still owed" warning (exact cover)',
    !/still owed|owed/i.test(tenderText),
    tenderText.replace(/\n/g, ' '),
  )
  await shot('sale-split-tender')
  await page.getByRole('button', { name: /Complete cash/ }).click()
  await page.waitForSelector('text=PAYMENT COMPLETE', { timeout: 20000 })
  pass('split-tender checkout completed ($8 + ៛8,200 for $10)')
  await page.waitForSelector('.success-layer', {
    state: 'detached',
    timeout: 20000,
  })

  // --- Logout / login cycle: an open server shift must still show Open ---
  await page.locator('.cashier-profile').click()
  await page.locator('.profile-popover button:has-text("Sign out")').click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Email' }).click()
  await page.waitForTimeout(300)
  await page.getByLabel('Email address').fill(CASHIER_EMAIL)
  await page.getByLabel('Password').fill(CASHIER_PASS)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForSelector('text=What are we serving?', { timeout: 30000 })
  check(
    'shift badge still Open after logout/login (shift survives)',
    (await page.locator('.shift-status').getAttribute('class')).includes(
      'open',
    ),
  )

  // --- Close the shift through the UI, counting BOTH currency piles ---
  await page.locator('.shift-status').click()
  await page.waitForSelector('.shift-modal-body', { timeout: 10000 })
  const closeSummary = await page
    .locator('.shift-close-summary')
    .innerText()
  const expectedUsd = closeSummary.match(/\$([\d,]+\.\d{2})/)?.[1] ?? ''
  const expectedKhr = closeSummary.match(/៛([\d,]+)/)?.[1] ?? '0'
  check(
    'close modal shows per-currency expected drawer',
    expectedUsd !== '' && expectedKhr !== '0',
    closeSummary.replace(/\n/g, ' '),
  )
  // Fill the exact expected amounts → zero variance in both currencies.
  await page.locator('.large-cash-input input').first().fill(expectedUsd)
  await page.locator('.large-cash-input.khr input').fill(expectedKhr)
  await shot('sale-close-shift-dual-currency')
  await page
    .getByRole('button', { name: /Close & reconcile|Close shift/ })
    .first()
    .click()
  await page.waitForTimeout(1500)
  check(
    'shift badge flips to Closed after UI close',
    (await page.locator('.shift-status').getAttribute('class')).includes(
      'closed',
    ),
  )

  // --- Stale-indicator regression: another terminal opens a shift via the
  // API while this terminal sits idle. The 15s poll must flip the badge
  // without any reload or user action.
  const reopen = await api('/api/shifts/open', {
    method: 'POST',
    token: adminToken,
    body: { openingCash: 50, openingCashKhr: 20000 },
  })
  check('reopen shift via API (other terminal)', reopen.status === 201)
  let flipped = false
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(1500)
    const cls = await page.locator('.shift-status').getAttribute('class')
    if (cls.includes('open')) {
      flipped = true
      break
    }
  }
  check(
    'idle sale terminal picks up externally-opened shift (live poll)',
    flipped,
  )
  await shot('sale-shift-live-poll')

  // Close it again from the API (admin) and check the ADMIN app badge too.
  const closeAgain = await api('/api/shifts/close', {
    method: 'POST',
    token: adminToken,
    body: { closingCash: 50, closingCashKhr: 20000 },
  })
  check('close shift via API', closeAgain.status === 200)
  const current = await api('/api/shifts/current', { token: adminToken })
  check(
    '/api/shifts/current is null after close',
    current.status === 200 && current.json === null,
  )
}

// =====================================================================
console.log('\n########## PHASE E — SHOP APP + CUSTOMER API ##########')
await page.goto(SHOP_URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const shopText = await page.locator('body').innerText()
check(
  'shop shows Telegram identity required state (no initData in browser)',
  /Telegram/i.test(shopText),
)
await shot('shop-no-telegram')

// Customer API with a valid signed initData (real flow the shop app uses)
if (BOT_TOKEN) {
  const initData = signedInitData({
    id: 9001,
    first_name: 'Srey',
    username: 'srey_test',
  })
  const menu = await api('/api/customer-products', {
    method: 'POST',
    body: { initData },
  })
  check(
    'customer-products 200 with real menu',
    menu.status === 200 &&
      menu.json.products.some((p) => p.name === 'Smoke Cake'),
    `${menu.status}`,
  )
  const custOrder = await api('/api/customer-orders', {
    method: 'POST',
    body: { initData, items: [{ productId: prod.json.id, quantity: 1 }] },
  })
  check(
    'customer-orders 201',
    custOrder.status === 201,
    `${custOrder.status} ${JSON.stringify(custOrder.json)}`,
  )
  const all = await api('/api/orders', { token: adminToken })
  check(
    'telegram order appears in admin order list',
    all.json.some((o) => o.id === custOrder.json.id),
  )
}

// =====================================================================
console.log('\n########## PHASE F — HOLD / PARK AN ORDER, THEN PAY IT ##########')
{
  // The hold endpoints are shift-gated, so make sure a shift is open first.
  const shiftNow = await api('/api/shifts/current', { token: adminToken })
  if (!shiftNow.json) {
    const opened = await api('/api/shifts/open', {
      method: 'POST',
      token: adminToken,
      body: { openingCash: 20, openingCashKhr: 0 },
    })
    check('phase F: shift open', opened.status === 201, `${opened.status}`)
  }

  await page.goto(SALE_URL, { waitUntil: 'networkidle' })
  // The terminal may still hold the cashier session from phase D2.
  if ((await page.locator('.product-workspace').count()) === 0) {
    await page.getByRole('button', { name: 'Email' }).click()
    await page.waitForTimeout(300)
    await page.getByLabel('Email address').fill(CASHIER_EMAIL)
    await page.getByLabel('Password').fill(CASHIER_PASS)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForSelector('.product-workspace', { timeout: 30000 })
  }

  const product = prod.json // the "Smoke Cake" created in phase B
  const before = await api('/api/products', { token: adminToken })
  const stockBefore = before.json.find((p) => p.id === product.id)?.stock

  // 1. Park an order for a customer who will pay when they come back.
  await page.locator('.product-card', { hasText: 'Smoke Cake' }).first().click()
  await page.waitForTimeout(400)
  await page.locator('.cart-hold-button').click()
  await page.locator('.cart-hold-form input').fill('Dara — pays on collection')
  await page.locator('.cart-hold-confirm').click()
  await page.waitForTimeout(1200)
  await shot('sale-hold-created')

  const heldAfter = await api('/api/orders/held', { token: adminToken })
  const parked = (heldAfter.json || []).find(
    (o) => o.holdLabel === 'Dara — pays on collection',
  )
  check('holding an order parks it in the held queue', Boolean(parked))
  const afterHold = await api('/api/products', { token: adminToken })
  check(
    'held order reserves stock instead of selling it',
    afterHold.json.find((p) => p.id === product.id)?.stock === stockBefore,
    `stock ${stockBefore} -> ${
      afterHold.json.find((p) => p.id === product.id)?.stock
    }`,
  )
  const heldText = await page.locator('.held-panel').innerText()
  check(
    'held panel shows the order at the terminal',
    heldText.includes('Dara — pays on collection'),
  )

  // 2. Resume it into the cart: it must STAY held until the sale is paid.
  await page.locator('.held-resume').first().click()
  await page.waitForTimeout(800)
  const stillHeld = await api('/api/orders/held', { token: adminToken })
  check(
    'resuming keeps the hold parked until payment',
    (stillHeld.json || []).some((o) => o.id === parked?.id),
  )
  check(
    'resumed hold put the item back in the cart',
    (await page.locator('.cart-item').count()) > 0,
  )

  // 3. Take the payment — the hold must be released by the paid sale.
  await page.locator('.cash-input input').first().fill(String(parked?.total ?? 50))
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /Complete cash/ }).click()
  await page.waitForSelector('text=PAYMENT COMPLETE', { timeout: 20000 })
  await shot('sale-hold-paid')
  await page.waitForSelector('.success-layer', {
    state: 'detached',
    timeout: 20000,
  })

  const heldEnd = await api('/api/orders/held', { token: adminToken })
  check(
    'paying the resumed cart RELEASES the hold (no longer held)',
    !(heldEnd.json || []).some((o) => o.id === parked?.id),
    JSON.stringify(heldEnd.json || []).slice(0, 200),
  )
  const released = await api('/api/orders', { token: adminToken })
  const releasedRow = (released.json || []).find((o) => o.id === parked?.id)
  check(
    'released hold is Cancelled, never counted as completed revenue',
    releasedRow && releasedRow.status === 'Cancelled',
    releasedRow ? releasedRow.status : 'missing',
  )
  check(
    'paid sale is Completed',
    (released.json || []).some(
      (o) => o.status === 'Completed' && o.id !== parked?.id,
    ),
  )
}

await browser.close()
console.log(
  failures === 0
    ? '\nALL UI CHECKS PASSED'
    : `\n${failures} UI CHECK(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
