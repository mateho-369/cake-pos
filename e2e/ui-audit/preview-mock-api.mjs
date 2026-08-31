/**
 * Zero-dependency mock API for eyeballing the admin app in a live preview.
 * Serves every endpoint the admin frontend calls on load, with deterministic
 * data: 84 orders spread across the current year (so "This year" is never
 * empty and "This month" has a handful), waste events, a business profile,
 * POS rules and small summary/cashier/audit payloads.
 *
 * Usage:   node e2e/ui-audit/preview-mock-api.mjs     (listens on 0.0.0.0:8080)
 * Then:    npm run dev:admin                            (Vite proxies /api here)
 *
 * Playwright browsers cannot be downloaded in this sandbox, so this mock plus
 * the Vite dev server is the only way to look at the UI; jsdom harnesses do
 * the assertions.
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT || 8080)
const now = new Date()

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
const at = (d, hour, minute = 0) => {
  const copy = new Date(d)
  copy.setHours(hour, minute, 0, 0)
  return copy.toISOString()
}
const pad = (n) => String(n).padStart(2, '0')

// ---------------------------------------------------------- deterministic data
const cashiers = ['Sophea Chan', 'Vibol Sok', 'Makara Piseth']
const products = [
  { id: 1, name: 'Matcha Cake', category: 'Cakes', stock: 12 },
  { id: 2, name: 'Choco Tart', category: 'Pastries', stock: 8 },
  { id: 3, name: 'Khmer Iced Coffee', category: 'Drinks', stock: 40 },
]
const startOfYear = new Date(now.getFullYear(), 0, 1)
const daysIntoYear = Math.max(
  1,
  Math.round((now - startOfYear) / 86400000) + 1,
)

// 84 orders, evenly spread over the days of the current year up to today.
const orders = Array.from({ length: 84 }, (_, index) => {
  const dayOffset = Math.round((index * (daysIntoYear - 1)) / 83)
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  day.setDate(day.getDate() - dayOffset)
  const telegram = index % 3 === 0
  const completed = index % 9 !== 0
  const quantity = (index % 4) + 1
  const unit = 450 + (index % 5) * 150 // cents
  const lineTotal = quantity * unit
  const discount = index % 7 === 0 ? 50 : 0
  const total = lineTotal - discount
  const payment = index % 2 === 0 ? 'Cash' : 'KHQR'
  const line = [
    {
      productId: products[index % products.length].id,
      description: products[index % products.length].name,
      quantity,
      unitPriceCents: unit,
      lineTotalCents: lineTotal,
    },
  ]
  return {
    id: `CS-${1001 + index}`,
    pickupCode: telegram ? `K${(index % 90) + 10}QZ` : null,
    createdAt: at(day, 9 + (index % 10), index % 60),
    time: `${pad(9 + (index % 10))}:${pad(index % 60)}`,
    date: iso(day),
    cashier: telegram ? 'Customer order' : cashiers[index % cashiers.length],
    customer: telegram ? { name: `Telegram customer ${index + 1}` } : null,
    source: telegram ? 'telegram' : 'walk-in',
    items: quantity,
    subtotal: lineTotal,
    discountAmount: discount,
    total,
    payment: completed ? payment : null,
    status: completed
      ? 'Completed'
      : index % 2 === 0
        ? 'Cancelled'
        : 'Pending',
    detail: [`${products[index % products.length].name} × ${quantity}`],
    lineItems: line,
  }
})

const wasteEvents = Array.from({ length: 8 }, (_, index) => {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  day.setDate(day.getDate() - index * 2)
  return {
    id: index + 1,
    productName: products[index % products.length].name,
    category: products[index % products.length].category,
    quantity: index + 1,
    reason: ['Expired', 'Damaged', 'Expired'][index % 3],
    retailValue: 5 * (index + 1),
    recordedAt: at(day, 15, index * 7),
    recordedBy: cashiers[index % cashiers.length],
  }
})

const inRange = (d, from, to) => {
  if (!d) return false
  const day = new Date(d).toISOString().slice(0, 10)
  return day >= (from || '0000-01-01') && day <= (to || '9999-12-31')
}
const ordersIn = (from, to) =>
  orders.filter((order) => inRange(order.createdAt, from, to))
const sum = (list) => list.reduce((acc, n) => acc + (n || 0), 0)

const json = (res, obj) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(obj))
}

const routes = {
  '/healthz': (res) => json(res, { ok: true, service: 'preview-mock-api' }),
  '/api/orders': (res, url) => {
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    json(res, from || to ? ordersIn(from, to) : orders)
  },
  '/api/orders/pending': (res) => json(res, []),
  '/api/products': (res) => json(res, products),
  '/api/categories': (res) =>
    json(res, [
      { id: 1, name: 'Cakes', revenue: 420, color: '#ec4899' },
      { id: 2, name: 'Pastries', revenue: 260, color: '#f59e0b' },
      { id: 3, name: 'Drinks', revenue: 130, color: '#10b981' },
    ]),
  '/api/employees': (res) =>
    json(res, cashiers.map((name, i) => ({ id: i + 1, name, role: 'cashier' }))),
  '/api/customers': (res) => json(res, []),
  '/api/shifts': (res) => json(res, []),
  '/api/shifts/current': (res) => json(res, null),
  '/api/reports/summary': (res, url) => {
    const range = ordersIn(
      url.searchParams.get('from'),
      url.searchParams.get('to'),
    )
    const netRevenueCents = sum(range.map((o) => o.total))
    json(res, {
      todaySalesTotal: sum(ordersIn(iso(now), iso(now)).map((o) => o.total)),
      todayOrdersCount: ordersIn(iso(now), iso(now)).length,
      netRevenueCents,
      completedOrderCount: range.filter((o) => o.status === 'Completed').length,
      averageOrderValueCents: range.length
        ? Math.round(netRevenueCents / range.length)
        : 0,
      revenueData: [...new Array(14)].map((_, i) => {
        const d = new Date(now)
        d.setDate(d.getDate() - 13 + i)
        return {
          day: iso(d),
          value: sum(ordersIn(iso(d), iso(d)).map((o) => o.total)),
        }
      }),
      topProducts: products.map((p, i) => ({
        name: p.name,
        units: 20 - i * 4,
        revenue: 90 - i * 20,
      })),
    })
  },
  '/api/reports/freshness': (res) =>
    json(res, {
      wasteThisWeekCents: sum(
        wasteEvents
          .filter((e) => (now - new Date(e.recordedAt)) / 86400000 <= 7)
          .map((e) => e.retailValue),
      ),
      events: wasteEvents,
      dailyWaste: wasteEvents.map((e) => ({
        day: iso(new Date(e.recordedAt)),
        value: e.retailValue,
      })),
    }),
  '/api/reports/cashiers': (res) =>
    json(
      res,
      cashiers.map((name, i) => ({
        cashier_id: i + 1,
        name,
        completedOrderCount: 28 - i * 5,
        netRevenueCents: 28000 - i * 5000,
        discountsCents: 800 + i * 100,
        discountCount: 3 + i,
        voidCount: i,
        voidAmountCents: i * 300,
        refundCount: 0,
        refundAmountCents: 0,
        shiftsClosed: 12,
        shortfallCount: i === 2 ? 2 : 0,
        repeatedShortfall: i === 2,
        varianceHistory: [
          {
            closedAt: at(now, 21, 0),
            openingCashUsdCents: 10000,
            expectedCashUsdCents: 20000,
            closingCashUsdCents: 19000 - i * 500,
            varianceUsdCents: -1000 - i * 500,
          },
        ],
      })),
    ),
  '/api/reports/audit': (res) =>
    json(
      res,
      [0, 1, 2].map((i) => ({
        id: i + 1,
        at: at(now, 10 + i, i * 11),
        employee: cashiers[i],
        employeeId: i + 1,
        action: ['order.discount', 'order.voided', 'shift'][i],
        orderId: `CS-${1001 + i}`,
        details:
          i === 0 ? { discountAmountCents: 50 } : i === 1 ? {} : { varianceUsdCents: -1000 },
        ip: '10.0.0.2',
      })),
    ),
  '/api/reports/losses': (res) =>
    json(res, {
      wasteCents: 4200,
      discountsCents: 3100,
      voidsCents: 900,
      refundsCents: 0,
      cashShortagesCents: 1000,
      totalLostCents: 9200,
    }),
  '/api/reports/retention': (res) =>
    json(res, {
      customersWithOrders: 24,
      newCustomers: 9,
      returningCustomers: 15,
      repeatRatePercent: 63,
      repeatCustomers: 15,
      customers: [],
    }),
  '/api/settings/business-profile': (res) =>
    json(res, {
      businessName: 'G-Cake',
      locationName: 'Toul Kork',
      address: '12 Street 315, Phnom Penh',
      phone: '+855 12 345 678',
    }),
  '/api/settings/pos-rules': (res) =>
    json(res, { defaultShelfLifeDays: 3, maxCashierDiscountPercent: 10 }),
}

createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    })
    return res.end()
  }
  const url = new URL(req.url, 'http://localhost')
  const handler = routes[url.pathname]
  if (handler) return handler(res, url)
  json(res, null)
}).listen(PORT, '0.0.0.0', () => {
  console.log(`preview-mock-api listening on http://0.0.0.0:${PORT}`)
})
