/**
 * Mobile responsive audit — drives the REAL built admin + sale apps in
 * headless Chromium at phone widths (iPhone 13: 390×844, and a small
 * Android: 360×740), opens every page and the key modals/panels, and fails
 * on real layout breakage:
 *
 *   - horizontal overflow (document.scrollWidth > viewport width)
 *   - elements that stick out of the viewport with no way to scroll to them
 *   - controls whose computed font-size is under 16px (the iOS Safari
 *     auto-zoom-on-focus trigger the shop owner reported as "messy
 *     resizing")
 *
 * Env: ADMIN_URL, SALE_URL, API_URL, ADMIN_EMAIL, ADMIN_PASS.
 * Usage: node e2e/ui/mobile-audit.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const artifacts = join(root, 'e2e/ui/artifacts/mobile')
mkdirSync(artifacts, { recursive: true })

const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:4173'
const SALE_URL = process.env.SALE_URL || 'http://localhost:4174'
const API_URL = process.env.API_URL || 'http://127.0.0.1:8080'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'owner@atelier.local'
const ADMIN_PASS = process.env.ADMIN_PASS || 'ChangeMe123!'

const VIEWPORTS = [
  { name: 'iphone-13', width: 390, height: 844 },
  { name: 'small-android', width: 360, height: 740 },
]

// [label, page id] — mirrors the jsdom audit PAGES list so both harnesses
// break together if a nav label is renamed.
const adminPages = [
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

let failures = 0
const fail = (label, extra = '') => {
  failures++
  console.log(`FAIL  ${label}${extra ? `  — ${extra}` : ''}`)
}
const pass = (label) => console.log(`PASS  ${label}`)

/**
 * Elements that are ALWAYS allowed to sit outside the viewport, because
 * they are parked off-canvas on purpose and slid in by an interaction
 * (sidebars, bottom sheets, drawers). Their closed state is asserted by the
 * class the app uses to open them.
 */
const OFF_CANVAS_SELECTORS = [
  '.sidebar:not(.sidebar-open)',
  '.sidebar-backdrop',
  '.cart-panel:not(.mobile-open)',
  '.mobile-cart-backdrop',
]

async function auditPage(page, label, viewportName) {
  // 1. horizontal overflow check — the page must never scroll sideways.
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    }
  })
  if (overflow.scrollWidth > overflow.clientWidth + 1) {
    fail(
      `[${viewportName}] ${label}: horizontal overflow`,
      `scrollWidth ${overflow.scrollWidth} > viewport ${overflow.clientWidth}`,
    )
  }
  // 2. content that pokes out of the viewport with no way to reach it.
  //    Skipped when an ancestor scrolls (tables, filter rows, settings nav
  //    are intentionally swipeable) or clips, and for off-canvas drawers.
  const { wide, clipped } = await page.evaluate((offCanvas) => {
    const vw = document.documentElement.clientWidth
    const offenders = []
    const clippedOffenders = []
    const nameOf = (el) => {
      const raw =
        (el.className && (el.className.baseVal ?? el.className)) || ''
      return `${el.tagName.toLowerCase()}.${String(raw).split(' ')[0]}`
    }
    const clippedOrScrollable = (el) => {
      let parent = el.parentElement
      while (parent && parent !== document.documentElement) {
        const style = getComputedStyle(parent)
        // A vertical scroller does NOT make wide content reachable: only
        // skip when the box really scrolls sideways, or clips on purpose.
        if (
          /auto|scroll/.test(style.overflowX) &&
          parent.scrollWidth > parent.clientWidth + 1
        )
          return true
        if (/hidden|clip/.test(style.overflowX)) return true
        parent = parent.parentElement
      }
      return false
    }
    for (const el of document.querySelectorAll('body *')) {
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      if (rect.right <= vw + 8 && rect.left >= -8) continue
      if (offCanvas.some((selector) => el.closest(selector))) continue
      if (clippedOrScrollable(el)) {
        clippedOffenders.push(nameOf(el))
        continue
      }
      offenders.push(
        `${nameOf(el)}@${Math.round(rect.left)}..${Math.round(rect.right)}`,
      )
    }
    return {
      wide: offenders.slice(0, 5),
      clipped: clippedOffenders.slice(0, 5),
    }
  }, OFF_CANVAS_SELECTORS)
  if (wide.length > 0) {
    fail(
      `[${viewportName}] ${label}: elements outside viewport`,
      wide.join(' | '),
    )
  }
  // Not a failure (the design may clip on purpose) but worth seeing in the
  // log: content wider than the phone inside an overflow:hidden box cannot be
  // reached by swiping.
  if (clipped.length > 0) {
    console.log(
      `WARN  [${viewportName}] ${label}: ${clipped.length} element(s) wider than the viewport inside a clipped box (${clipped.join(' | ')})`,
    )
  }
  // 3. focused-input font-size (iOS auto-zoom trigger).
  const smallInputs = await page.evaluate(() => {
    const bad = []
    const selector = [
      'input[type="text"]',
      'input[type="number"]',
      'input[type="email"]',
      'input[type="password"]',
      'input[type="date"]',
      'input[type="tel"]',
      'input:not([type])',
      'select',
      'textarea',
    ].join(', ')
    for (const el of document.querySelectorAll(selector)) {
      const visible = el.offsetParent !== null || el.getClientRects().length > 0
      if (!visible) continue
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < 16) {
        const cls = String(el.className ?? '').split(' ')[0]
        bad.push(`${el.tagName.toLowerCase()}.${cls}@${size}px`)
      }
    }
    return bad.slice(0, 5)
  })
  // The gallery caption field is a deliberate 12px micro-control and the
  // command palette input lives in a desktop-only overlay.
  const relevant = smallInputs.filter(
    (x) => !x.includes('.edit-gallery-caption') && !x.includes('.command-card'),
  )
  if (relevant.length > 0) {
    fail(`[${viewportName}] ${label}: inputs under 16px (auto-zoom risk)`, relevant.join(' | '))
  }
  if (!relevant.length && !wide.length && overflow.scrollWidth <= overflow.clientWidth + 1) {
    pass(`[${viewportName}] ${label}: layout fits`)
  }
}

/**
 * Below 1080px the admin sidebar is an off-canvas drawer (translateX out of
 * the viewport), so a nav item can only be reached after the hamburger opens
 * it. Selecting the item closes the drawer again (Sidebar calls onClose).
 */
async function navigateAdmin(page, label) {
  const menu = page.locator('.topbar .menu-button')
  if (await menu.isVisible().catch(() => false)) {
    await menu.click()
  }
  await page.waitForSelector('.sidebar.sidebar-open', { timeout: 15000 })
  const item = page
    .locator('.sidebar-nav .nav-item')
    .filter({ hasText: label })
    .first()
  if ((await item.count()) === 0) {
    throw new Error(`sidebar nav item not found: ${label}`)
  }
  await item.click()
  await page.waitForSelector('.sidebar.sidebar-open', {
    state: 'detached',
    timeout: 15000,
  })
  await page.waitForTimeout(500)
}

/** Modals have no global Escape handler — close them the way a user does. */
async function closeModals(page) {
  for (let i = 0; i < 4; i++) {
    const close = page.locator('.modal-header button.icon-button').first()
    if ((await close.count()) === 0) break
    await close.click().catch(() => undefined)
    await page.waitForTimeout(250)
  }
  await page.keyboard.press('Escape').catch(() => undefined)
  await page.waitForTimeout(200)
}

async function loginAdmin(page, email, password) {
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in securely' }).click()
  await page.waitForSelector('.sidebar-nav, nav.sidebar', { timeout: 30000 })
}

async function loginSale(page, email, password) {
  await page.getByRole('button', { name: 'Email' }).click()
  await page.waitForTimeout(300)
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForSelector('.product-workspace', { timeout: 30000 })
}

/** Same API calls the apps make — used to set up real state (open shift). */
async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_URL}${path}`, {
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

async function ensureOpenShift() {
  const login = await api('/api/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASS },
  })
  const token = login.json?.token
  if (!token) {
    fail('sale setup: admin API login failed', `status ${login.status}`)
    return
  }
  const opened = await api('/api/shifts/open', {
    method: 'POST',
    body: { openingCash: 100, openingCashKhr: 40000 },
    token,
  })
  if (opened.status === 201) pass('sale setup: shift opened for the audit')
  else if (opened.status === 200 || opened.status === 422)
    pass('sale setup: a shift is already open')
  else
    fail(
      'sale setup: could not open a shift',
      `status ${opened.status} ${JSON.stringify(opened.json).slice(0, 120)}`,
    )
}

async function run() {
  await ensureOpenShift()
  const browser = await chromium.launch()
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    })
    // Both apps default to Khmer; force English so the nav labels below
    // match what is rendered (same trick as ui-smoke.mjs).
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem('atelier.language', 'en')
      } catch {}
    })
    const page = await context.newPage()
    page.on('pageerror', (err) =>
      console.log(`  [browser pageerror] ${err.message}`),
    )

    // ---------------- admin app ----------------
    await page.goto(ADMIN_URL, { waitUntil: 'networkidle' })
    await loginAdmin(page, ADMIN_EMAIL, ADMIN_PASS)
    for (const [pg, slug] of adminPages) {
      const label = `admin:${slug}`
      try {
        await page.goto(`${ADMIN_URL}/`)
        await page.waitForLoadState('networkidle')
        // SPA: navigate through the sidebar (hash-less routing via state).
        if (pg !== 'Overview') await navigateAdmin(page, pg)
        await auditPage(page, label, viewport.name)
        await page.screenshot({
          path: join(artifacts, `${viewport.name}-${label}.png`),
          fullPage: false,
        })
      } catch (error) {
        fail(`[${viewport.name}] ${label}: navigation failed`, error.message)
      }
    }

    // Modal click-through on categories + products.
    try {
      await page.goto(`${ADMIN_URL}/`)
      await page.waitForLoadState('networkidle')
      await navigateAdmin(page, 'Categories')
      const newCategory = page
        .locator('button.primary-button')
        .filter({ hasText: 'New' })
        .first()
      if (await newCategory.count()) {
        await newCategory.click()
        await page.waitForTimeout(500)
        await auditPage(
          page,
          'admin:categories:new-category-modal',
          viewport.name,
        )
        await page.screenshot({
          path: join(artifacts, `${viewport.name}-admin-categories-modal.png`),
        })
        await closeModals(page)
      }
      await navigateAdmin(page, 'Product catalog')
      // header quick-add opens the shared product picker.
      const addProduct = page.locator('header .header-add').first()
      if (await addProduct.count()) {
        await addProduct.click()
        await page.waitForTimeout(500)
        await auditPage(page, 'admin:products:add-product-modal', viewport.name)
        await page.screenshot({
          path: join(artifacts, `${viewport.name}-admin-add-product-modal.png`),
        })
        await closeModals(page)
      }
    } catch (error) {
      fail(`[${viewport.name}] admin modals: ${error.message}`)
    }

    // ---------------- sale app (fresh session, separate origin) ----------------
    const salePage = await context.newPage()
    salePage.on('pageerror', (err) =>
      console.log(`  [browser pageerror] ${err.message}`),
    )
    try {
      await salePage.goto(SALE_URL, { waitUntil: 'networkidle' })
      await loginSale(salePage, ADMIN_EMAIL, ADMIN_PASS)
      await auditPage(salePage, 'sale:terminal', viewport.name)
      await salePage.screenshot({
        path: join(artifacts, `${viewport.name}-sale-terminal.png`),
      })

      // Add a real product so the mobile cart dock + sheet are auditable.
      const card = salePage.locator('.product-card').first()
      if (await card.count()) {
        await card.click()
        await salePage.waitForTimeout(500)
      }
      const mobileCart = salePage.locator('.mobile-cart-dock').first()
      if (await mobileCart.count()) {
        await mobileCart.click()
        await salePage.waitForTimeout(600)
        await auditPage(salePage, 'sale:cart-panel', viewport.name)
        await salePage.screenshot({
          path: join(artifacts, `${viewport.name}-sale-cart.png`),
        })
        const closeCart = salePage.locator('.mobile-close-cart').first()
        if (await closeCart.count()) await closeCart.click()
        await salePage.waitForTimeout(400)
      } else {
        fail(`[${viewport.name}] sale:cart-panel: no mobile cart dock`)
      }

      // Shift modal (open/close + dual-currency counting) on a phone.
      const shiftButton = salePage.locator('.shift-status').first()
      if (await shiftButton.count()) {
        await shiftButton.click()
        await salePage.waitForSelector('.shift-modal-body', { timeout: 15000 })
        await salePage.waitForTimeout(400)
        await auditPage(salePage, 'sale:shift-modal', viewport.name)
        await salePage.screenshot({
          path: join(artifacts, `${viewport.name}-sale-shift-modal.png`),
        })
        await closeModals(salePage)
      }
    } catch (error) {
      fail(`[${viewport.name}] sale terminal: ${error.message}`)
    }
    await context.close()
  }
  await browser.close()
  if (failures > 0) {
    console.log(`\nMOBILE AUDIT FAILED (${failures} issue(s))`)
    process.exit(1)
  }
  console.log('\nMOBILE AUDIT PASSED')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
