/**
 * Fake "production" API for backend/tests/e2e/live-prod-selftest.sh.
 *
 * It behaves like the real shift API (ONE global shift, 409 when a second is
 * opened, 409 on double close) and lets the self-test inject the failures
 * that used to strand production:
 *
 *   PORT=8099 node backend/tests/e2e/live-prod-stub.mjs
 *
 * Fault injection (env):
 *   FAIL_CLOSE_TIMES=n  the first n POST /api/shifts/close calls return 500
 *   SLOW_LOGOUT_MS=n    delay the cashier logout by n ms (window to SIGTERM)
 *   SEED_SHIFT=ci|real|closed-ci
 *                       start with a shift already open (CI leftover vs a
 *                       real cashier's shift) — or, with closed-ci, a shift
 *                       that is already CLOSED (the list says Closed) while
 *                       SIMULATE_STALE_EDGE_CACHE keeps serving its last
 *                       open snapshot on the plain /current URL
 *   SIMULATE_STALE_EDGE_CACHE=1
 *                       GET /api/shifts/current WITHOUT a `cb` query param
 *                       returns the last open snapshot even after close
 *                       (a URL-keyed edge cache holding a stale entry);
 *                       any ?cb=... request bypasses it and sees the truth
 *   EMPTY_OBJECT_CURRENT=1
 *                       with no shift open, /api/shifts/current answers {}
 *                       instead of null — the stale production deploy that
 *                       trained every client to render a ghost Open shift
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT || 8099)
const FAIL_CLOSE_TIMES = Number(process.env.FAIL_CLOSE_TIMES || 0)
const SLOW_LOGOUT_MS = Number(process.env.SLOW_LOGOUT_MS || 0)
const SEED_SHIFT = process.env.SEED_SHIFT || ''
const STALE_CACHE = process.env.SIMULATE_STALE_EDGE_CACHE === '1'
const EMPTY_OBJECT_CURRENT = process.env.EMPTY_OBJECT_CURRENT === '1'

let nextId = 1
let closeFailures = 0
const tokens = new Map()

const shiftBody = (shift, extra = {}) => ({
  id: shift.id,
  employeeId: 1,
  openingCash: shift.openingCashUsdCents / 100,
  closingCash: 0,
  expectedCash: shift.openingCashUsdCents / 100,
  variance: 0,
  // Frozen at open time — a fresh timestamp per render would make two polls
  // differ, and the probe's cache forensics reads that as a cache artifact.
  openedAt: shift.openedAt,
  closedAt: null,
  status: 'Open',
  openingCashUsdCents: shift.openingCashUsdCents,
  openingCashKhr: shift.openingCashKhr,
  expectedCashUsdCents: shift.openingCashUsdCents,
  expectedCashKhr: shift.openingCashKhr,
  closingCashUsdCents: 0,
  closingCashKhr: 0,
  varianceUsdCents: 0,
  varianceKhr: 0,
  openedBy: shift.openedBy,
  startedAt: '9:00 AM',
  ...extra,
})

let shift = null
const closedShifts = []
// The last snapshot a "stale edge cache" serves after the shift is gone.
let staleOpenSnapshot = null
const makeShift = (fields) => ({
  id: nextId++,
  openedAt: new Date().toISOString(),
  ...fields,
})
if (SEED_SHIFT === 'ci')
  shift = makeShift({
    openingCashUsdCents: 10000,
    openingCashKhr: 0,
    openedBy: 'Sophea Chan',
  })
if (SEED_SHIFT === 'real')
  shift = makeShift({
    openingCashUsdCents: 3750,
    openingCashKhr: 0,
    openedBy: 'Real Cashier',
  })
if (SEED_SHIFT === 'closed-ci') {
  const seeded = makeShift({
    openingCashUsdCents: 10000,
    openingCashKhr: 0,
    openedBy: 'Sophea Chan',
  })
  staleOpenSnapshot = shiftBody(seeded) // what the "edge cache" holds
  closedShifts.push({
    ...staleOpenSnapshot,
    status: 'Closed',
    closingCash: 100,
    closingCashUsdCents: 10000,
    closedAt: new Date().toISOString(),
  })
}

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
  })

// Defaults to the stub's own origin so the probe passes by default; the
// self-test overrides it to prove a disallowed origin fails loudly.
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS || `http://127.0.0.1:${PORT}`
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  const body = await readBody(req)
  const send = (code, payload, extraHeaders = {}) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, private, max-age=0',
      ...extraHeaders,
    })
    res.end(JSON.stringify(payload))
  }
  const auth = req.headers.authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const employee = tokens.get(token)

  const origin = req.headers.origin
  const corsHeaders =
    origin && ALLOWED_ORIGINS.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
      : {}
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...corsHeaders,
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Accept,Authorization,Content-Type',
    })
    return res.end()
  }
  if (path === '/healthz')
    return send(200, { ok: true }, corsHeaders)
  if (path === '/api/login') {
    const token = `tok-${Math.random().toString(36).slice(2)}`
    const name = String(body.email || '').startsWith('sophea')
      ? 'Sophea Chan'
      : 'Store Owner'
    tokens.set(token, name)
    return send(200, { token, employee: { name, role: 'admin' } })
  }
  if (path === '/api/logout') {
    if (SLOW_LOGOUT_MS && employee === 'Sophea Chan') {
      await new Promise((r) => setTimeout(r, SLOW_LOGOUT_MS))
    }
    tokens.delete(token)
    return send(200, { ok: true })
  }
  if (path === '/api/shifts/current') {
    // A URL-keyed shared cache holds the snapshot from when the shift was
    // open; any request with a cache-busting `cb` query misses it and sees
    // the live truth. Requests WITHOUT cb get the stale copy.
    if (STALE_CACHE && staleOpenSnapshot && !url.searchParams.has('cb')) {
      return send(200, staleOpenSnapshot)
    }
    // The stale production deploy: "no open shift" as an empty object.
    if (!shift && EMPTY_OBJECT_CURRENT) return send(200, {})
    return send(200, shift ? shiftBody(shift) : null)
  }
  if (path === '/api/shifts' && req.method === 'GET') {
    return send(200, shift ? [...closedShifts, shiftBody(shift)] : closedShifts)
  }
  if (path === '/api/shifts/open' && req.method === 'POST') {
    if (shift) return send(409, { message: 'A shift is already open' })
    shift = makeShift({
      openingCashUsdCents: Math.round(Number(body.openingCash || 0) * 100),
      openingCashKhr: Number(body.openingCashKhr || 0),
      openedBy: employee || 'unknown',
    })
    staleOpenSnapshot = shiftBody(shift)
    return send(201, shiftBody(shift))
  }
  if (path === '/api/shifts/close' && req.method === 'POST') {
    if (!shift) return send(409, { message: 'No open shift' })
    if (closeFailures < FAIL_CLOSE_TIMES) {
      closeFailures++
      return send(500, { message: 'simulated upstream failure' })
    }
    const closed = shiftBody(shift, {
      status: 'Closed',
      closingCash: Number(body.closingCash || 0),
      closingCashUsdCents: Math.round(Number(body.closingCash || 0) * 100),
      closedAt: new Date().toISOString(),
    })
    closedShifts.push(closed)
    shift = null
    return send(200, closed)
  }
  // Everything else: read-only endpoints the probe sweeps.
  if (path.startsWith('/api/')) {
    if (path.includes('summary'))
      return send(200, {
        todaySalesTotal: 0,
        yesterdaySalesTotal: 0,
        itemsSold: 0,
        ordersData: [],
      })
    return send(200, Array.isArray(body) ? [] : { ok: true })
  }
  return send(404, { message: 'not found' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`live-prod stub listening on ${PORT}`)
})
