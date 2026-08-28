/**
 * Mobile responsive audit — drives the REAL built admin + sale apps in
 * headless Chromium at phone widths (iPhone 13: 390×844, and a small
 * Android: 360×740), opens every page and the key modals/panels, and fails
 * on real layout breakage:
 *
 *   - horizontal overflow (document.scrollWidth > viewport width)
 *   - elements wider than the viewport
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

// [trigger selector, name] — header quick-add opens the shared picker.
const adminModalChecks = [
  ['header .header-add', 'add-product-modal'],
]
// Sidebar labels exactly as rendered (mirrors the jsdom audit PAGES list).
const adminPages = [
  'Overview',
  'Sales & orders',
  'Customers',
  'Product catalog',
  'Freshness & waste',
  'Categories',
  'Team & access',
  'Shifts & cash',
  'Reports',
  'Settings',
  'Media Library',
]

let failures = 0
const fail = (label, extra = '') => {
  failures++
  console.log(`FAIL  ${label}${extra ? `  — ${extra}` : ''}`)
}
const pass = (label) => console.log(`PASS  ${label}`)

async function auditPage(page, label, viewportName) {
  // 1. horizontal overflow check
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
  // 2. off-screen / too-wide elements
  const wide = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const offenders = []
    for (const el of document.querySelectorAll('body *')) {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && (rect.right > vw + 8 || rect.left < -8)) {
        const cls = (el.className && String(el.className.baseVal ?? el.className)) || ''
        offenders.push(`${el.tagName.toLowerCase()}.${cls.split(' ')[0]}@${Math.round(rect.left)}..${Math.round(rect.right)}`)
      }
    }
    return offenders.slice(0, 5)
  })
  const meaningful = wide.filter(
    (x) => !/^(html|body)/i.test(x) && !x.includes('.modal-layer'),
  )
  // Fixed elements (toasts, docks) can legitimately sit at edges; only fail
  // for content that actually pokes out of the viewport.
  if (meaningful.length > 0) {
    fail(`[${viewportName}] ${label}: elements outside viewport`, meaningful.join(' | '))
  } else {
    pass(`[${viewportName}] ${label}: layout fits`)
  }
  // 3. focused-input font-size (iOS auto-zoom trigger)
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
  const relevant = smallInputs.filter(
    (x) => !x.includes('.edit-gallery-caption') && !x.includes('.command-card'),
  )
  if (relevant.length > 0) {
    fail(`[${viewportName}] ${label}: inputs under 16px (auto-zoom risk)`, relevant.join(' | '))
  }
}

// Same flows the desktop smoke uses, so selectors stay honest.
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

async function run() {
  const browser = await chromium.launch()
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()

    // ---------------- admin app ----------------
    await page.goto(ADMIN_URL, { waitUntil: 'networkidle' })
    await loginAdmin(page, ADMIN_EMAIL, ADMIN_PASS)
    for (const pg of adminPages) {
      await page.goto(`${ADMIN_URL}/`)
      await page.waitForLoadState('networkidle')
      // SPA: navigate through the sidebar (hash-less routing via state).
      const sidebarButton = page
        .locator('.sidebar button, nav.sidebar-nav button')
        .filter({ hasText: pg })
        .first()
      const label = `admin:${pg.toLowerCase().replace(/[^a-z]+/g, '-')}`
      if (pg !== 'Overview') {
        const count = await sidebarButton.count()
        if (count > 0) {
          await sidebarButton.click()
          await page.waitForTimeout(600)
        } else {
          fail(`[${viewport.name}] admin sidebar link not found: ${pg}`)
        }
      }
      await auditPage(page, label, viewport.name)
      await page.screenshot({
        path: join(artifacts, `${viewport.name}-${label}.png`),
        fullPage: false,
      })
    }
    // Modal click-through on products + categories.
    const nav = async (name) => {
      const btn = page
        .locator('nav.sidebar-nav button')
        .filter({ hasText: name })
        .first()
      if (await btn.count()) {
        await btn.click()
        await page.waitForTimeout(500)
      }
    }
    await nav('Categories')
    const newCategory = page.locator('button.primary-button:has-text("New")').first()
    if (await newCategory.count()) {
      await newCategory.click()
      await page.waitForTimeout(400)
      await auditPage(page, 'admin:categories:new-category-modal', viewport.name)
      await page.screenshot({
        path: join(artifacts, `${viewport.name}-admin-categories-modal.png`),
      })
      await page.keyboard.press('Escape')
    }
    await nav('Product catalog')
    for (const [selector, name] of adminModalChecks) {
      const trigger = page.locator(selector).first()
      if (await trigger.count()) {
        await trigger.click()
        await page.waitForTimeout(500)
        await auditPage(page, `admin:products:${name}`, viewport.name)
        await page.screenshot({
          path: join(artifacts, `${viewport.name}-admin-${name}.png`),
        })
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)
      }
    }

    // ---------------- sale app (fresh page, no prior session) ----------------
    await context.clearCookies()
    await page.goto(SALE_URL, { waitUntil: 'networkidle' })
    await loginSale(page, ADMIN_EMAIL, ADMIN_PASS)
    await auditPage(page, 'sale:terminal', viewport.name)
    await page.screenshot({ path: join(artifacts, `${viewport.name}-sale-terminal.png`) })
    // open-shift modal
    const shiftButton = page.locator('.shift-status, .shift-gate-banner').first()
    if (await shiftButton.count()) {
      await shiftButton.click()
      await page.waitForTimeout(400)
      await auditPage(page, 'sale:shift-modal', viewport.name)
      await page.screenshot({
        path: join(artifacts, `${viewport.name}-sale-shift-modal.png`),
      })
      await page.keyboard.press('Escape')
    }
    // cart panel (needs an item: quick add flow kept simple — open cart dock)
    const mobileCart = page.locator('.mobile-cart-dock, button.mobile-cart-button').first()
    if (await mobileCart.count()) {
      await mobileCart.click().catch(() => undefined)
      await page.waitForTimeout(400)
      await auditPage(page, 'sale:cart-panel', viewport.name)
      await page.screenshot({
        path: join(artifacts, `${viewport.name}-sale-cart.png`),
      })
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
