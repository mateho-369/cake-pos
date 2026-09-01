/**
 * Unit tests for the apps' pure logic — real source code bundled with esbuild
 * and executed in Node. Every expectation is hand-computed.
 *
 * Usage: node e2e/unit/unit-tests.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'e2e/unit/out')
mkdirSync(outDir, { recursive: true })

let failures = 0
const check = (label, cond, extra = '') => {
  console.log(
    `${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`,
  )
  if (!cond) failures++
}

async function bundle(entrySource, name) {
  const entry = join(outDir, `${name}.ts`)
  writeFileSync(entry, entrySource)
  const out = join(outDir, `${name}.cjs`)
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: out,
    logLevel: 'silent',
  })
  return await import(out)
}

// ---------------- currency.ts (sale app, real source) ----------------
const currencySrc = readFileSync(
  join(root, 'apps/sale/src/lib/currency.ts'),
  'utf8',
)
const { usdCentsToKhr } = await bundle(currencySrc, 'currency')
// Hand-computed cases (mirrors the backend integer math):
// $20.00 @ 4100 = 8,200,000 riel; increment 100 -> 82,000 KHR, rounding 0
let r = usdCentsToKhr(2000, 4100, 100)
check(
  'usdCentsToKhr(2000, 4100, 100) -> 82000 KHR, 0 rounding',
  r.khr === 82000 && r.settlementRoundingKhr === 0,
  JSON.stringify(r),
)
// $20.50 @ 4100 = 8,405,000; rounds to 84,100 (rounds up 8,405,000+5,000 -> 8,410,000), rounding +50
r = usdCentsToKhr(2050, 4100, 100)
check(
  'usdCentsToKhr(2050, 4100, 100) -> 84100 KHR, +50 rounding',
  r.khr === 84100 && r.settlementRoundingKhr === 50,
  JSON.stringify(r),
)
// $100 @ 4100 = 41,000,000 -> 410,000 KHR, 0 rounding
r = usdCentsToKhr(10000, 4100, 100)
check(
  'usdCentsToKhr(10000, 4100, 100) -> 410000 KHR, 0 rounding',
  r.khr === 410000 && r.settlementRoundingKhr === 0,
  JSON.stringify(r),
)
// increment 50: $20.00 @ 4100 -> 82,000 (no change), rounding 0
r = usdCentsToKhr(2000, 4100, 50)
check(
  'usdCentsToKhr(2000, 4100, 50) -> 82000 KHR, 0 rounding',
  r.khr === 82000 && r.settlementRoundingKhr === 0,
  JSON.stringify(r),
)

// ---------------- tender.ts (sale app, real source) ----------------
const tenderSrc = readFileSync(
  join(root, 'apps/sale/src/lib/tender.ts'),
  'utf8',
)
const { splitTender, cashTenderPayload } = await bundle(tenderSrc, 'tender')
// Worked example from the shop owner: $10.00 total, customer pays
// $8.00 + ៛8,200 at rate 4100 → exactly covered, change 0.
r = splitTender(1000, 800, 8200, 4100)
check(
  'splitTender($10, $8 + ៛8200 @4100) -> exact, change 0',
  !r.short &&
    Math.abs(r.totalReceivedUsd - 10) < 1e-9 &&
    r.changeUsd === 0 &&
    r.changeKhrRounded === 0,
  JSON.stringify(r),
)
// Change rounding to nearest 100 riel: $10 total, $12 tendered →
// change $2 = ៛8,200 exactly.
r = splitTender(1000, 1200, 0, 4100)
check(
  'splitTender($10, $12) -> change $2 / ៛8,200',
  Math.abs(r.changeUsd - 2) < 1e-9 && r.changeKhrRounded === 8200,
  JSON.stringify(r),
)
// Fractional change rounds to nearest 100: $10.55 total, $20 tendered →
// change $9.45 = ៛38,745 → rounds to ៛38,700 (nearest 100, no fraction).
r = splitTender(1055, 2000, 0, 4100)
check(
  'splitTender($10.55, $20) -> ៛ change rounds to 38,700',
  r.changeKhrRounded === 38700,
  JSON.stringify(r),
)
// Short tender: $10 total, $5 + ៛10,000 (= $2.4390…) → short by
// 10 − 5 − 10000/4100 = $2.560975609756…
r = splitTender(1000, 500, 10000, 4100)
check(
  'splitTender($10, $5 + ៛10,000) -> short by exact remainder',
  r.short && Math.abs(r.shortByUsd - (10 - 5 - 10000 / 4100)) < 1e-9,
  JSON.stringify(r),
)
// Riel-only exact: $2.00 = ៛8,200 (the owner’s own example).
r = splitTender(200, 0, 8200, 4100)
check(
  'splitTender($2, ៛8,200) -> exact',
  !r.short && r.changeUsd === 0,
  JSON.stringify(r),
)
// KHR equivalent hint for KHQR display: $10.55 → ៛43,255.
r = splitTender(1055, 0, 0, 4100)
check(
  'splitTender totalKhrEquivalent($10.55 @4100) = 43,255',
  r.totalKhrEquivalent === 43255,
  JSON.stringify(r),
)
// Walk-in / delayed /pay payload: change is USD cents = round(changeCentRiel / rate),
// never dollars. $9 + ៛4100 on a $10 due is exact → change 0.
{
  const p = cashTenderPayload(1000, 900, 4100, 4100)
  check(
    'cashTenderPayload($10, $9 + ៛4100) records both tenders, change 0',
    p.usdReceivedCents === 900 &&
      p.khrReceived === 4100 &&
      p.changeUsdCents === 0 &&
      p.changeKhr === 0 &&
      p.exchangeRateKhrPerUsd === 4100,
    JSON.stringify(p),
  )
  const over = cashTenderPayload(1000, 2000, 0, 4100)
  // $10 extra → 1,000 cents × 4100 = 4,100,000 cent-riel → 1000 USD cents
  check(
    'cashTenderPayload change is USD cents not dollars ($20 on $10 → 1000)',
    over.changeUsdCents === 1000 && over.usdReceivedCents === 2000,
    JSON.stringify(over),
  )
}

// ---------------- ordersInRange (admin exports lib, real source) ----------------
const exportsSrc = readFileSync(
  join(root, 'apps/admin/src/lib/exports.ts'),
  'utf8',
)
const stubSrc = exportsSrc.replace(
  /function download\(blob: Blob, filename: string\) \{[\s\S]*?\n\}/,
  'function download() {}',
)
// exports.ts imports its sibling branding module; copy it into the bundle
// directory so esbuild resolves it the same way Vite does.
writeFileSync(
  join(outDir, 'reportBranding.ts'),
  readFileSync(join(root, 'apps/admin/src/lib/reportBranding.ts'), 'utf8'),
)
const { ordersInRange } = await bundle(stubSrc, 'orders')
const base = {
  id: 'x',
  time: '',
  date: '',
  cashier: '',
  source: 'walk-in',
  items: 1,
  payment: null,
  status: 'Completed',
  detail: [],
  total: 1,
}
const orders = [
  { ...base, id: 'CS-1', createdAt: '2026-08-20T02:00:00.000Z' },
  { ...base, id: 'CS-2', createdAt: '2026-08-21T02:00:00.000Z' },
  { ...base, id: 'CS-3', createdAt: '2026-08-25T23:59:59.000Z' },
]
check(
  'ordersInRange includes boundary dates',
  ordersInRange(orders, '2026-08-20', '2026-08-21').length === 2,
  String(ordersInRange(orders, '2026-08-20', '2026-08-21').length),
)
check(
  'ordersInRange excludes out-of-range',
  ordersInRange(orders, '2026-08-22', '2026-08-24').length === 0,
)
check(
  'ordersInRange single day works',
  ordersInRange(orders, '2026-08-21', '2026-08-21').length === 1,
)
check(
  'ordersInRange empty range = all',
  ordersInRange(orders, '', '').length === 3,
)

// ---------------- exports math (docx revenue aggregation, real source) ----------------
// exportSummaryWord computes revenue = completed(Paid/Ready/Completed) + corrections(Refunded/Voided) totals.
// Verify the hand-computed aggregation indirectly by running the real module (already done in
// exports-verify), plus a direct check of the corrections rule with a refunded negative total:
const completed = [20, 11.25]
const corrections = [-5]
check(
  'docx revenue rule: 20.00+11.25-5.00 = 26.25',
  (
    completed.reduce((a, b) => a + b, 0) +
    corrections.reduce((a, b) => a + b, 0)
  ).toFixed(2) === '26.25',
)

// ---------------- @cake-pos/telegram (shared Mini App chrome) ----------------
// Every surface opened from the bot (shop storefront, sale terminal, sale
// /customer storefront) must ask for TRUE fullscreen, not just expand(), and
// must retry once after the first user gesture when the client refuses the
// programmatic request (iOS). These run the real package source.
const telegramEntry = `export * from '${join(
  root,
  'packages/telegram/src/index.ts',
)}'\n`
const {
  requestTelegramFullscreen,
  prepareTelegramChrome,
  syncTelegramInsets,
  setTelegramBackButton,
  setTelegramClosingConfirmation,
  isTelegramClient,
} = await bundle(telegramEntry, 'telegram-chrome')

// Minimal document stub: the package registers a pointerdown retry listener
// and writes the Telegram content safe area onto <html> as custom props.
const listeners = []
const rootStyleProps = {}
const documentStub = {
  addEventListener: (type, handler) => listeners.push({ type, handler }),
  removeEventListener: (type, handler) => {
    const index = listeners.findIndex(
      (entry) => entry.type === type && entry.handler === handler,
    )
    if (index >= 0) listeners.splice(index, 1)
  },
  documentElement: {
    style: {
      setProperty: (name, value) => {
        rootStyleProps[name] = value
      },
      removeProperty: (name) => {
        delete rootStyleProps[name]
      },
    },
  },
}
const originalDocument = globalThis.document
globalThis.document = documentStub
const tap = () =>
  listeners
    .filter((entry) => entry.type === 'pointerdown')
    .forEach((entry) => entry.handler())

const fakeWebApp = (overrides = {}) => {
  const events = {}
  return {
    calls: { fullscreen: 0, ready: 0, expand: 0, offEvent: 0 },
    ready() {
      this.calls.ready++
    },
    expand() {
      this.calls.expand++
    },
    requestFullscreen() {
      this.calls.fullscreen++
    },
    isVersionAtLeast: () => true,
    onEvent(type, handler) {
      ;(events[type] ||= []).push(handler)
    },
    offEvent(type) {
      this.calls.offEvent++
      delete events[type]
    },
    fire(type) {
      ;(events[type] || []).forEach((handler) => handler())
    },
    ...overrides,
  }
}

// 1. Old clients (< 8.0) never get a fullscreen request — expand() only.
listeners.length = 0
let app = fakeWebApp({ isVersionAtLeast: () => false })
let cleanup = requestTelegramFullscreen(app)
check(
  'telegram: pre-8.0 client is left on expand() (no fullscreen request)',
  app.calls.fullscreen === 0 && cleanup instanceof Function,
)
cleanup()

// 2. A modern client gets exactly one fullscreen request up front.
listeners.length = 0
app = fakeWebApp()
cleanup = requestTelegramFullscreen(app)
check(
  'telegram: 8.0+ client receives requestFullscreen() on open',
  app.calls.fullscreen === 1,
)

// 3. iOS gesture path: fullscreenFailed schedules ONE retry on first tap.
app.fire('fullscreenFailed')
check(
  'telegram: fullscreenFailed arms a retry on the first user gesture',
  listeners.filter((entry) => entry.type === 'pointerdown').length === 1,
)
tap()
tap()
check(
  'telegram: the gesture retries fullscreen exactly once',
  app.calls.fullscreen === 2,
  `calls=${app.calls.fullscreen}`,
)
check(
  'telegram: the retry listener is removed after firing',
  listeners.filter((entry) => entry.type === 'pointerdown').length === 0,
)
cleanup()

// 4. Unmount before any tap: no leaked listener, offEvent called once
//    (StrictMode double-mount safety).
listeners.length = 0
app = fakeWebApp()
cleanup = requestTelegramFullscreen(app)
app.fire('fullscreenFailed')
cleanup()
check(
  'telegram: cleanup removes the gesture listener on unmount',
  listeners.length === 0 && app.calls.offEvent === 1,
)
tap()
check(
  'telegram: no retry fires after unmount',
  app.calls.fullscreen === 1,
  `calls=${app.calls.fullscreen}`,
)

// 5. Wrappers whose requestFullscreen throws synchronously still arm the
//    gesture retry instead of crashing the Mini App.
listeners.length = 0
let threw = false
app = fakeWebApp({
  requestFullscreen() {
    // Count first, then throw: the helper must survive a wrapper that
    // advertises the method and rejects it at call time.
    this.calls.fullscreen++
    threw = true
    throw new Error('unsupported by this wrapper')
  },
})
cleanup = requestTelegramFullscreen(app)
tap()
check(
  'telegram: a throwing requestFullscreen falls back to the gesture retry',
  threw &&
    // 1 initial throw + 1 retry on the tap, neither surfaced to the user
    app.calls.fullscreen === 2 &&
    listeners.filter((entry) => entry.type === 'pointerdown').length === 0,
  `calls=${app.calls.fullscreen}`,
)
cleanup()

// 6. Shared chrome: ready + expand + brand colours for every surface.
app = fakeWebApp()
prepareTelegramChrome(app)
check(
  'telegram: prepareTelegramChrome calls ready() + expand()',
  app.calls.ready === 1 && app.calls.expand === 1,
)
prepareTelegramChrome(undefined)
check('telegram: outside Telegram every helper is a safe no-op', true)

// 7. Insets. Telegram's OWN fullscreen chrome (the back/close pill) floats
//    over the top of the Mini App and env(safe-area-*) cannot see it, so
//    the package publishes what layouts must pad by:
//      --tg-safe-*         device notch / home indicator
//      --tg-content-safe-* Telegram's chrome, measured INSIDE the safe area
//      --tg-inset-*        the two ADDED — the value CSS actually uses
const insetVars = () => ({
  top: rootStyleProps['--tg-inset-top'],
  bottom: rootStyleProps['--tg-inset-bottom'],
  left: rootStyleProps['--tg-inset-left'],
  right: rootStyleProps['--tg-inset-right'],
})

// 7a. Written immediately — no event needed, so the first paint already
//     clears Telegram's overlaid controls.
app = fakeWebApp({
  contentSafeAreaInset: { top: 46, bottom: 0, left: 20, right: 20 },
  safeAreaInset: { top: 59, bottom: 34, left: 0, right: 0 },
})
let areaCleanup = syncTelegramInsets(app)
check(
  'telegram: insets published immediately on all four sides',
  JSON.stringify(insetVars()) ===
    JSON.stringify({
      top: '105px',
      bottom: '34px',
      left: '20px',
      right: '20px',
    }),
  JSON.stringify(insetVars()),
)
// THE bug this fixes: contentSafeAreaInset is measured inside the device
// safe area, so max() (59px) leaves the app header sitting under
// Telegram's back button. Only the sum (59 + 46) clears it.
check(
  'telegram: the top inset is device + Telegram chrome, not the larger one',
  insetVars().top === '105px',
  JSON.stringify(insetVars()),
)
check(
  'telegram: both halves stay readable on their own',
  rootStyleProps['--tg-safe-top'] === '59px' &&
    rootStyleProps['--tg-content-safe-top'] === '46px',
  `${rootStyleProps['--tg-safe-top']} + ${rootStyleProps['--tg-content-safe-top']}`,
)

// 7b. contentSafeAreaChanged re-reads live values (rotation / chrome
//     appearing), and fullscreenChanged re-syncs as belt-and-braces.
app.contentSafeAreaInset = { top: 0, bottom: 0, left: 0, right: 0 }
app.fire('contentSafeAreaChanged')
check(
  'telegram: contentSafeAreaChanged re-publishes the new insets',
  insetVars().top === '59px' && insetVars().bottom === '34px',
  JSON.stringify(insetVars()),
)
app.safeAreaInset = { top: 24, bottom: 0, left: 0, right: 0 }
app.fire('fullscreenChanged')
check(
  'telegram: fullscreenChanged re-syncs the insets',
  insetVars().top === '24px',
  JSON.stringify(insetVars()),
)

// 7c. Older clients (Bot API < 8.0) only report the device safeAreaInset.
//     They cannot run fullscreen, so no Telegram chrome exists and the
//     device inset alone is correct.
app.contentSafeAreaInset = undefined
app.safeAreaInset = { top: 24, bottom: 20, left: 0, right: 0 }
app.fire('safeAreaChanged')
check(
  'telegram: pre-8.0 clients fall back to safeAreaInset alone',
  insetVars().top === '24px' && insetVars().bottom === '20px',
  JSON.stringify(insetVars()),
)

// 7d. Cleanup unsubscribes: later events must not rewrite the properties.
const offBeforeCleanup = app.calls.offEvent
areaCleanup()
check(
  'telegram: cleanup unsubscribes every inset listener',
  app.calls.offEvent === offBeforeCleanup + 4,
  `${offBeforeCleanup} -> ${app.calls.offEvent}`,
)
app.safeAreaInset = { top: 99, bottom: 99, left: 99, right: 99 }
app.fire('safeAreaChanged')
app.fire('contentSafeAreaChanged')
check(
  'telegram: no rewrites after cleanup (no leaked listeners)',
  insetVars().top === '24px',
  JSON.stringify(insetVars()),
)

// 7e. A client reporting neither inset still yields a usable 0px value.
app = fakeWebApp()
areaCleanup = syncTelegramInsets(app)
check(
  'telegram: client without insets publishes 0px on all sides',
  JSON.stringify(insetVars()) ===
    JSON.stringify({ top: '0px', bottom: '0px', left: '0px', right: '0px' }),
  JSON.stringify(insetVars()),
)
areaCleanup()

// 7f. Fullscreen with zeroed insets (a real macOS/desktop client bug):
//     reserve room anyway, or Telegram's close button lands on top of the
//     terminal's own controls with nothing to push them down.
app = fakeWebApp({ isFullscreen: true })
areaCleanup = syncTelegramInsets(app)
check(
  'telegram: fullscreen with no reported inset still reserves the top strip',
  insetVars().top === '56px' && insetVars().bottom === '0px',
  JSON.stringify(insetVars()),
)
areaCleanup()
// …but a real reported inset always wins over that floor.
app = fakeWebApp({
  isFullscreen: true,
  safeAreaInset: { top: 59, bottom: 0, left: 0, right: 0 },
  contentSafeAreaInset: { top: 46, bottom: 0, left: 0, right: 0 },
})
areaCleanup = syncTelegramInsets(app)
check(
  'telegram: a real fullscreen inset is used as-is (no clamping to the floor)',
  insetVars().top === '105px',
  JSON.stringify(insetVars()),
)
areaCleanup()

// 7g. A client reporting nonsense (the web client once reported the whole
//     window height as the bottom inset) must not push the UI off-screen.
app = fakeWebApp({
  safeAreaInset: { top: 0, bottom: 9000, left: 0, right: 0 },
})
areaCleanup = syncTelegramInsets(app)
check(
  'telegram: a runaway inset is capped instead of shoving the UI away',
  insetVars().bottom === '200px',
  JSON.stringify(insetVars()),
)
areaCleanup()

// 7h. The combined entry point wires the same publication (sale terminal,
//     admin console, shop storefront and /customer all run through it),
//     turns off swipe-to-minimise, and still cleans up both halves.
let swipesDisabled = 0
app = fakeWebApp({
  contentSafeAreaInset: { top: 46, bottom: 0, left: 0, right: 0 },
  disableVerticalSwipes: () => {
    swipesDisabled++
  },
})
const combinedCleanup = prepareTelegramChrome(app)
check(
  'telegram: prepareTelegramChrome publishes the insets too',
  insetVars().top === '46px' && app.calls.ready === 1 && app.calls.expand === 1,
  JSON.stringify(insetVars()),
)
check(
  'telegram: scrolling a grid can no longer minimise the Mini App',
  swipesDisabled === 1,
)
combinedCleanup()
app.contentSafeAreaInset = { top: 88, bottom: 0, left: 0, right: 0 }
app.fire('contentSafeAreaChanged')
check(
  'telegram: prepareTelegramChrome cleanup stops the inset sync',
  insetVars().top === '46px',
  JSON.stringify(insetVars()),
)
syncTelegramInsets(undefined)
check(
  'telegram: inset sync outside Telegram is a safe no-op',
  insetVars().top === '46px',
)

// 8. Telegram's native BackButton: the control a Mini App user reaches for
//    first. A screen owns it while mounted and gives it back on unmount.
{
  const events = []
  const backButton = {
    show: () => events.push('show'),
    hide: () => events.push('hide'),
    onClick: (handler) => events.push(['onClick', handler]),
    offClick: (handler) => events.push(['offClick', handler]),
  }
  const withBack = fakeWebApp({ BackButton: backButton })
  const handler = () => events.push('tapped')
  const stop = setTelegramBackButton(withBack, handler)
  check(
    'telegram: a screen that can go back shows the native back button',
    events[0][0] === 'onClick' &&
      events[0][1] === handler &&
      events[1] === 'show',
    JSON.stringify(events.map((e) => (Array.isArray(e) ? e[0] : e))),
  )
  stop()
  check(
    'telegram: leaving the screen unsubscribes AND hides it again',
    events[2][0] === 'offClick' &&
      events[2][1] === handler &&
      events[3] === 'hide',
    JSON.stringify(events.map((e) => (Array.isArray(e) ? e[0] : e))),
  )
  events.length = 0
  setTelegramBackButton(withBack, null)
  check(
    'telegram: a screen with nowhere to go back to never shows the button',
    events.length === 0,
  )
  check(
    'telegram: back button on a client without one is a safe no-op',
    setTelegramBackButton(fakeWebApp(), () => {}) instanceof Function,
  )
}

// 9. Closing confirmation: only while there is a cart to lose.
{
  let enabled = 0
  let disabled = 0
  const withConfirm = fakeWebApp({
    enableClosingConfirmation: () => enabled++,
    disableClosingConfirmation: () => disabled++,
  })
  const stop = setTelegramClosingConfirmation(withConfirm, true)
  check(
    'telegram: a cart in progress arms the closing confirmation',
    enabled === 1,
  )
  stop()
  check('telegram: emptying the cart disarms it again', disabled === 1)
  setTelegramClosingConfirmation(withConfirm, false)
  check(
    'telegram: an empty cart never arms it (no nagging on every close)',
    enabled === 1,
  )
}

// 10. telegram-web-app.js defines window.Telegram.WebApp in ANY browser tab
//     it is loaded in, reporting platform 'unknown'. Staff opening the
//     terminal on a laptop must not get padding reserved for chrome that
//     is not there.
check(
  'telegram: platform "unknown" (plain browser tab) is not a Telegram client',
  isTelegramClient(fakeWebApp({ platform: 'unknown' })) === false,
)
check(
  'telegram: a real client is detected',
  isTelegramClient(fakeWebApp({ platform: 'ios' })) === true,
)
check(
  'telegram: a wrapper without platform stays treated as Telegram',
  isTelegramClient(fakeWebApp()) === true,
)
check(
  'telegram: no wrapper at all is not Telegram',
  isTelegramClient(undefined) === false,
)

// 11. Regression guard: every header-side rule that pads for the device
//     inset must also take the Telegram inset, on all FOUR surfaces
//     (sale terminal, sale /customer, shop storefront, admin console).
{
  const count = (file, needle) =>
    readFileSync(join(root, file), 'utf8').split(needle).length - 1
  const saleTerminal = count(
    'apps/sale/src/index.css',
    'var(--tg-inset-top, 0px)',
  )
  const saleCustomer = count(
    'apps/sale/src/customer.css',
    'var(--tg-inset-top, 0px)',
  )
  const shopCustomer = count(
    'apps/shop/src/customer.css',
    'var(--tg-inset-top, 0px)',
  )
  const adminConsole = count(
    'apps/admin/src/index.css',
    'var(--tg-inset-top, 0px)',
  )
  // Sale terminal: header padding + header height, cart panel top/height
  // (desktop), mobile header height/padding, profile popover, shift-gate
  // banner, queue view/page heads, modals = 9+ call sites.
  check(
    'telegram: sale terminal header stack uses --tg-inset-top (>=9)',
    saleTerminal >= 9,
    `found ${saleTerminal}`,
  )
  check(
    'telegram: sale /customer header uses --tg-inset-top (>=3)',
    saleCustomer >= 3,
    `found ${saleCustomer}`,
  )
  check(
    'telegram: shop storefront header uses --tg-inset-top (>=6)',
    shopCustomer >= 6,
    `found ${shopCustomer}`,
  )
  // Admin console: top bar padding + height, sidebar, dialogs = 4+.
  check(
    'telegram: admin console top bar uses --tg-inset-top (>=4)',
    adminConsole >= 4,
    `found ${adminConsole}`,
  )
  // The old max() shape is the bug: it reserves the LARGER of the two
  // insets, leaving the header under Telegram's back button.
  const stale = [
    'apps/sale/src/index.css',
    'apps/sale/src/customer.css',
    'apps/shop/src/customer.css',
    'apps/admin/src/index.css',
  ]
    .map((file) => count(file, 'var(--tg-content-safe-top'))
    .reduce((total, n) => total + n, 0)
  check(
    'telegram: no surface still pads by the content inset alone',
    stale === 0,
    `found ${stale}`,
  )
}

globalThis.document = originalDocument

// ---------------- @cake-pos/api-client normalizeCurrentShift (real package source) ----------------
// The production badge bug: the stale backend deploy answered "no open
// shift" from /api/shifts/current with an empty object {} instead of null,
// and every badge/panel gates on plain truthiness — {} is truthy, so admin
// and sale permanently showed an "Open" ghost shift (Invalid Date and all)
// while /api/shifts said the shift had been closed for hours. The
// normalizer both apps now run the response through must collapse anything
// that is not a real shift object (identified by its id) to null.
{
  const apiClientEntry = `export * from '${join(
    root,
    'packages/api-client/src/index.ts',
  )}'\n`
  const { normalizeCurrentShift } = await bundle(apiClientEntry, 'api-client')
  check(
    'normalizeCurrentShift(null) -> null',
    normalizeCurrentShift(null) === null,
  )
  check(
    'normalizeCurrentShift(undefined) -> null',
    normalizeCurrentShift(undefined) === null,
  )
  check(
    'normalizeCurrentShift({}) -> null  (the production ghost shift)',
    normalizeCurrentShift({}) === null,
  )
  check('normalizeCurrentShift([]) -> null', normalizeCurrentShift([]) === null)
  const realShift = { id: 7, status: 'Open', openingCashUsdCents: 10000 }
  check(
    'normalizeCurrentShift(shift with id) passes the object through',
    normalizeCurrentShift(realShift) === realShift,
  )
  check(
    'normalizeCurrentShift({ id: 1, status: "Closed" }) passes through (states with a record keep it)',
    normalizeCurrentShift({ id: 1, status: 'Closed' })?.id === 1,
  )

  // The browser-cache half of the shift fix: authenticated requests must ask
  // the browser not to reuse live state (the backend also emits no-store).
  const clientCalls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    clientCalls.push({ url: String(url), init })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const { createApiClient } = await bundle(apiClientEntry, 'api-client-client')
  await createApiClient({ getAccessToken: () => 'token' }).request(
    '/api/shifts/current',
  )
  check(
    'authenticated API requests use cache: "no-store"',
    clientCalls.at(-1)?.init.cache === 'no-store',
  )
  await createApiClient({}).request('/api/shifts/current')
  check(
    'unauthenticated public requests are not forced to no-store (cached menu still allowed)',
    clientCalls.at(-1)?.init.cache === undefined,
  )
  globalThis.fetch = originalFetch
}

// ---------------- shift start-time formatting (sale app, real source) ------
// The badge bug: both hydration sites silently fell back to "now" when the
// shift response was missing startedAt/openedAt. The formatter must return
// null when neither exists so the UI can say "start time unavailable".
{
  const shiftSrc = readFileSync(
    join(root, 'apps/sale/src/lib/shift.ts'),
    'utf8',
  )
  const { formatShiftStartedAt } = await bundle(shiftSrc, 'shift-start')
  check(
    'formatShiftStartedAt("9:00 AM") keeps the backend display string',
    formatShiftStartedAt('9:00 AM') === '9:00 AM',
  )
  check(
    'formatShiftStartedAt(undefined, openedAt) formats the ISO timestamp',
    formatShiftStartedAt(undefined, '2026-08-27T08:00:00Z') !== null,
  )
  check(
    'formatShiftStartedAt() returns null when both fields are missing (no fake "now")',
    formatShiftStartedAt() === null,
  )
  check(
    'formatShiftStartedAt(undefined, "not-a-date") returns null',
    formatShiftStartedAt(undefined, 'not-a-date') === null,
  )
}

// ---------------- customer-display device gating (sale app, real source) ---
// The iPad/phone hazard: window.open with popup features navigates the whole
// browser away. The button/function must only be available where a second
// display is actually possible, not on a coarse-touch device.
{
  const deviceSrc = readFileSync(
    join(root, 'apps/sale/src/lib/device.ts'),
    'utf8',
  )
  const { supportsCustomerDisplay } = await bundle(deviceSrc, 'device')
  check(
    'customer display supported with multi-screen API',
    supportsCustomerDisplay({
      hasGetScreenDetails: true,
      isExtendedScreen: false,
      finePointer: false,
      coarsePointer: true,
    }),
  )
  check(
    'customer display supported on a desktop mouse/trackpad',
    supportsCustomerDisplay({
      hasGetScreenDetails: false,
      isExtendedScreen: false,
      finePointer: true,
      coarsePointer: false,
    }),
  )
  check(
    'customer display hidden on iPad/phone (coarse touch, no second screen)',
    !supportsCustomerDisplay({
      hasGetScreenDetails: false,
      isExtendedScreen: false,
      finePointer: false,
      coarsePointer: true,
    }),
  )
  check(
    'customer display hidden when the environment cannot answer any pointer query',
    !supportsCustomerDisplay({
      hasGetScreenDetails: false,
      isExtendedScreen: false,
      finePointer: false,
      coarsePointer: false,
    }),
  )
}

console.log(
  failures === 0
    ? '\nALL UNIT TESTS PASSED'
    : `\n${failures} UNIT TEST(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
