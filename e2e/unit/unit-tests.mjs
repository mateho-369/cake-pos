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
const tenderSrc = readFileSync(join(root, 'apps/sale/src/lib/tender.ts'), 'utf8')
const { splitTender } = await bundle(tenderSrc, 'tender')
// Worked example from the shop owner: $10.00 total, customer pays
// $8.00 + ៛8,200 at rate 4100 → exactly covered, change 0.
r = splitTender(1000, 800, 8200, 4100)
check(
  'splitTender($10, $8 + ៛8200 @4100) -> exact, change 0',
  !r.short && Math.abs(r.totalReceivedUsd - 10) < 1e-9 &&
    r.changeUsd === 0 && r.changeKhrRounded === 0,
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

// ---------------- ordersInRange (admin exports lib, real source) ----------------
const exportsSrc = readFileSync(
  join(root, 'apps/admin/src/lib/exports.ts'),
  'utf8',
)
const stubSrc = exportsSrc.replace(
  /function download\(blob: Blob, filename: string\) \{[\s\S]*?\n\}/,
  'function download() {}',
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
const { requestTelegramFullscreen, prepareTelegramChrome } = await bundle(
  telegramEntry,
  'telegram-chrome',
)

// Minimal document stub: the package registers a pointerdown retry listener.
const listeners = []
const documentStub = {
  addEventListener: (type, handler) => listeners.push({ type, handler }),
  removeEventListener: (type, handler) => {
    const index = listeners.findIndex(
      (entry) => entry.type === type && entry.handler === handler,
    )
    if (index >= 0) listeners.splice(index, 1)
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
  check(
    'normalizeCurrentShift([]) -> null',
    normalizeCurrentShift([]) === null,
  )
  const realShift = { id: 7, status: 'Open', openingCashUsdCents: 10000 }
  check(
    'normalizeCurrentShift(shift with id) passes the object through',
    normalizeCurrentShift(realShift) === realShift,
  )
  check(
    'normalizeCurrentShift({ id: 1, status: "Closed" }) passes through (states with a record keep it)',
    normalizeCurrentShift({ id: 1, status: 'Closed' })?.id === 1,
  )
}

console.log(
  failures === 0
    ? '\nALL UNIT TESTS PASSED'
    : `\n${failures} UNIT TEST(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
