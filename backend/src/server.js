require('dotenv').config()

const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const database = require('./db')
let db

const PORT = Number(process.env.PORT || 8080)
const JWT_SECRET = process.env.JWT_SECRET
const corsOrigins = [process.env.ADMIN_ORIGIN, process.env.SALE_ORIGIN].filter(Boolean)

if (!JWT_SECRET) throw new Error('JWT_SECRET must be configured')

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

// The API is intentionally allowlist-only. Credentials are not used, so this is not cookie CORS.
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Accept, Authorization, Content-Type')
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  if (req.method === 'OPTIONS') {
    if (origin && !corsOrigins.includes(origin)) return res.status(403).json({ message: 'Origin is not allowed' })
    return res.sendStatus(204)
  }
  next()
})

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function sendError(res, error) {
  const status = Number(error.status || 500)
  if (status >= 500) console.error(error)
  return res.status(status).json({ message: status >= 500 ? 'Internal server error' : error.message })
}

function asyncRoute(handler) {
  return (req, res) => Promise.resolve(handler(req, res)).catch((error) => sendError(res, error))
}

function employeeForAuth(row) {
  return { id: row.id, name: row.name, ...(row.email ? { email: row.email } : {}), role: row.role }
}

function authenticate(req, _res, next) {
  try {
    const header = req.get('Authorization') || ''
    if (!header.startsWith('Bearer ')) throw httpError(401, 'Bearer token is required')
    const payload = jwt.verify(header.slice(7), JWT_SECRET)
    const employee = db.prepare('SELECT * FROM employees WHERE id = ? AND active = 1').get(Number(payload.sub))
    if (!employee) throw httpError(401, 'Token is invalid or the employee is inactive')
    req.employee = employee
    next()
  } catch (error) {
    next(error.status ? error : httpError(401, 'Bearer token is invalid or expired'))
  }
}

function requireAdmin(req, _res, next) {
  if (req.employee?.role !== 'admin') return next(httpError(403, 'Admin access is required'))
  next()
}

function dateOnly(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function productStatus(bestBefore) {
  if (!bestBefore || bestBefore === 'Made to order') return 'Fresh'
  const target = dateOnly(bestBefore)
  if (!target) return 'Fresh'
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((target.getTime() - start.getTime()) / 86400000)
  if (diff < 0) return 'Expired'
  if (diff === 0) return 'Expires today'
  if (diff === 1) return '1 day left'
  return 'Fresh'
}

function displayDate(value) {
  if (!value || value === 'Made to order') return value
  const isoMatch = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = isoMatch ? new Date(`${value}T00:00:00`) : new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function serializeProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    stock: Number(row.stock),
    sold: Number(row.sold),
    revenue: Number(row.revenue),
    status: productStatus(row.best_before),
    madeAt: displayDate(row.made_at),
    bestBefore: displayDate(row.best_before),
    imagePosition: row.image_position,
    active: Boolean(row.active),
  }
}

function serializeCategory(row) {
  const stats = db.prepare(`SELECT COUNT(*) AS items, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active, COALESCE(SUM(revenue), 0) AS revenue FROM products WHERE category = ?`).get(row.name)
  return { id: row.id, name: row.name, items: Number(stats.items), active: Number(stats.active), revenue: Number(stats.revenue), color: row.color, sortOrder: row.sort_order }
}

function serializeOrder(row) {
  const cashier = db.prepare('SELECT name FROM employees WHERE id = ?').get(row.cashier_id)
  return { id: row.id, time: row.time, date: row.date, cashier: cashier?.name || 'Unknown', items: Number(row.items), total: Number(row.total), payment: row.payment, status: row.status, detail: JSON.parse(row.detail_json) }
}

function employeeStatus(employeeId) {
  const shift = db.prepare("SELECT opened_at FROM shifts WHERE employee_id = ? AND status = 'Open' ORDER BY id DESC LIMIT 1").get(employeeId)
  return shift ? 'On shift' : 'Active'
}

function employeeShift(employeeId) {
  const shift = db.prepare("SELECT opened_at, closed_at FROM shifts WHERE employee_id = ? ORDER BY id DESC LIMIT 1").get(employeeId)
  if (!shift) return 'No shift recorded'
  const opened = new Date(shift.opened_at)
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(opened)
  if (!shift.closed_at) return `${time} – now`
  const closed = new Date(shift.closed_at)
  const closedTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(closed)
  return `${time} – ${closedTime}`
}

function serializeEmployee(row) {
  const sales = db.prepare("SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS orders FROM orders WHERE cashier_id = ? AND status = 'Completed' AND date = 'Today'").get(row.id)
  return { id: row.id, name: row.name, initials: row.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), email: row.email, role: row.role === 'admin' ? 'Owner · Admin' : 'Cashier', status: row.active ? employeeStatus(row.id) : 'Inactive', shift: employeeShift(row.id), sales: Number(sales.total), orders: Number(sales.orders) }
}

function parseProductBody(body, existing = {}) {
  const name = String(body.name ?? existing.name ?? '').trim()
  const category = String(body.category ?? existing.category ?? '').trim()
  const price = Number(body.price ?? existing.price)
  const stock = Number(body.stock ?? existing.stock)
  if (!name || !category) throw httpError(400, 'name and category are required')
  if (!Number.isFinite(price) || price < 0) throw httpError(400, 'price must be a non-negative number')
  if (!Number.isInteger(stock) || stock < 0) throw httpError(400, 'stock must be a non-negative integer')
  return { name, category, price, stock, madeAt: String(body.madeAt ?? existing.made_at ?? new Date().toISOString().slice(0, 10)), bestBefore: String(body.bestBefore ?? existing.best_before ?? new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)), imagePosition: String(body.imagePosition ?? existing.image_position ?? '0% 0%'), active: body.active === undefined ? (existing.active === undefined ? 1 : Number(Boolean(existing.active))) : Number(Boolean(body.active)) }
}

function nextOrderNumber() {
  const rows = db.prepare("SELECT id FROM orders WHERE id LIKE 'CS-%'").all()
  const max = rows.reduce((highest, row) => Math.max(highest, Number(row.id.slice(3)) || 0), 0)
  return max + 1
}

function formatToday() {
  return 'Today'
}

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

function reportSummary() {
  const todaySales = db.prepare("SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS orders FROM orders WHERE date = 'Today' AND status = 'Completed'").get()
  const topProducts = db.prepare('SELECT id, name, category, sold AS units, revenue FROM products ORDER BY sold DESC, revenue DESC LIMIT 5').all().map((row) => ({ ...row, units: Number(row.units), revenue: Number(row.revenue) }))
  const now = new Date()
  const revenueData = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index))
    const isoDay = day.toISOString().slice(0, 10)
    const value = db.prepare("SELECT COALESCE(SUM(total), 0) AS value FROM orders WHERE status = 'Completed' AND substr(created_at, 1, 10) = ?").get(isoDay).value
    return { day: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(day), value: Number(value) }
  })
  return { todaySalesTotal: Number(todaySales.total), todayOrdersCount: Number(todaySales.orders), revenueData, topProducts }
}

app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'cake-pos-api' }))

app.post('/api/login', asyncRoute(async (req, res) => {
  const { email, password, pin_code: pinCode } = req.body || {}
  let employee
  if (email && password) {
    employee = db.prepare('SELECT * FROM employees WHERE lower(email) = lower(?) AND active = 1').get(String(email).trim())
    if (!employee || !employee.password_hash || !(await bcrypt.compare(String(password), employee.password_hash))) throw httpError(401, 'Invalid email or password')
  } else if (pinCode) {
    const candidates = db.prepare('SELECT * FROM employees WHERE active = 1 ORDER BY role DESC, id ASC').all()
    employee = null
    for (const candidate of candidates) {
      if (candidate.pin_hash && await bcrypt.compare(String(pinCode), candidate.pin_hash)) { employee = candidate; break }
    }
    if (!employee) throw httpError(401, 'Invalid PIN')
  } else {
    throw httpError(400, 'Provide email and password, or pin_code')
  }
  const token = jwt.sign({ sub: employee.id, role: employee.role }, JWT_SECRET, { expiresIn: '12h' })
  res.json({ token, employee: employeeForAuth(employee) })
}))

app.use('/api', authenticate)

app.get('/api/products', asyncRoute(async (_req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY active DESC, id ASC').all()
  res.json(rows.map(serializeProduct))
}))

app.post('/api/products', asyncRoute(async (req, res) => {
  const values = parseProductBody(req.body)
  const timestamp = new Date().toISOString()
  const result = db.prepare(`INSERT INTO products (name, category, price, stock, made_at, best_before, image_position, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(values.name, values.category, values.price, values.stock, values.madeAt, values.bestBefore, values.imagePosition, values.active, timestamp, timestamp)
  res.status(201).json(serializeProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid)))
}))

app.put('/api/products/:id', requireAdmin, asyncRoute(async (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id))
  if (!existing) throw httpError(404, 'Product not found')
  const values = parseProductBody(req.body, existing)
  db.prepare(`UPDATE products SET name = ?, category = ?, price = ?, stock = ?, made_at = ?, best_before = ?, image_position = ?, active = ?, updated_at = ? WHERE id = ?`).run(values.name, values.category, values.price, values.stock, values.madeAt, values.bestBefore, values.imagePosition, values.active, new Date().toISOString(), existing.id)
  res.json(serializeProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id)))
}))

app.delete('/api/products/:id', requireAdmin, asyncRoute(async (req, res) => {
  const id = Number(req.params.id)
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id)
  if (!existing) throw httpError(404, 'Product not found')
  const references = db.prepare('SELECT COUNT(*) AS count FROM order_items WHERE product_id = ?').get(id).count
  if (Number(references) > 0) db.prepare('UPDATE products SET active = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), id)
  else db.prepare('DELETE FROM products WHERE id = ?').run(id)
  res.sendStatus(204)
}))

app.get('/api/categories', asyncRoute(async (_req, res) => {
  const rows = db.prepare('SELECT * FROM categories WHERE active = 1 ORDER BY sort_order, id').all()
  res.json(rows.map(serializeCategory))
}))

app.post('/api/categories', requireAdmin, asyncRoute(async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) throw httpError(400, 'name is required')
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM categories').get().value
  const result = db.prepare('INSERT INTO categories (name, color, active, sort_order) VALUES (?, ?, ?, ?)').run(name, String(req.body.color || '#be185d'), Number(req.body.active === undefined ? 1 : Boolean(req.body.active)), Number(req.body.sortOrder || maxOrder + 1))
  res.status(201).json(serializeCategory(db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid)))
}))

app.put('/api/categories/:id', requireAdmin, asyncRoute(async (req, res) => {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(req.params.id))
  if (!existing) throw httpError(404, 'Category not found')
  const name = String(req.body?.name ?? existing.name).trim()
  if (!name) throw httpError(400, 'name is required')
  db.prepare('UPDATE categories SET name = ?, color = ?, active = ?, sort_order = ? WHERE id = ?').run(name, String(req.body.color ?? existing.color), Number(req.body.active === undefined ? existing.active : Boolean(req.body.active)), Number(req.body.sortOrder ?? existing.sort_order), existing.id)
  res.json(serializeCategory(db.prepare('SELECT * FROM categories WHERE id = ?').get(existing.id)))
}))

app.delete('/api/categories/:id', requireAdmin, asyncRoute(async (req, res) => {
  const result = db.prepare('UPDATE categories SET active = 0 WHERE id = ?').run(Number(req.params.id))
  if (!result.changes) throw httpError(404, 'Category not found')
  res.sendStatus(204)
}))

app.get('/api/orders', asyncRoute(async (_req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC').all()
  res.json(rows.map(serializeOrder))
}))

app.post('/api/orders', asyncRoute(async (req, res) => {
  const payment = req.body?.payment === 'KHQR' || req.body?.payment === 'khqr' ? 'KHQR' : req.body?.payment === 'Cash' || req.body?.payment === 'cash' ? 'Cash' : null
  if (!payment) throw httpError(400, 'payment must be Cash or KHQR')
  const requestedItems = Array.isArray(req.body?.items) ? req.body.items : []
  if (!requestedItems.length) throw httpError(400, 'items are required')
  const order = db.transaction(() => {
    const normalized = requestedItems.map((item) => ({ productId: Number(item.productId ?? item.id), quantity: Number(item.quantity) }))
    if (normalized.some((item) => !Number.isInteger(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1)) throw httpError(400, 'Each item needs a productId and a positive integer quantity')
    const lineItems = normalized.map((item) => {
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(item.productId)
      if (!product) throw httpError(404, `Product ${item.productId} not found`)
      if (product.stock < item.quantity) throw httpError(409, `${product.name} does not have enough stock`)
      return { ...item, product }
    })
    const total = lineItems.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0)
    const items = lineItems.reduce((sum, item) => sum + item.quantity, 0)
    const id = `CS-${nextOrderNumber()}`
    const createdAt = new Date().toISOString()
    const details = lineItems.map((item) => `${item.product.name} × ${item.quantity}`)
    db.prepare(`INSERT INTO orders (id, cashier_id, time, date, items, total, payment, status, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'Completed', ?, ?)`).run(id, req.employee.id, formatTime(), formatToday(), items, total, payment, JSON.stringify(details), createdAt)
    const update = db.prepare('UPDATE products SET stock = stock - ?, sold = sold + ?, revenue = revenue + ?, updated_at = ? WHERE id = ? AND stock >= ?')
    for (const item of lineItems) {
      const result = update.run(item.quantity, item.quantity, Number(item.product.price) * item.quantity, createdAt, item.product.id, item.quantity)
      if (result.changes !== 1) throw httpError(409, `${item.product.name} stock changed; please retry`)
      db.prepare('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)').run(id, item.product.id, item.quantity, item.product.price)
    }
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(id)
  })
  res.status(201).json(serializeOrder(order))
}))

app.get('/api/employees', requireAdmin, asyncRoute(async (_req, res) => {
  const rows = db.prepare('SELECT * FROM employees ORDER BY active DESC, id').all()
  res.json(rows.map(serializeEmployee))
}))

app.post('/api/employees', requireAdmin, asyncRoute(async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = String(req.body?.email || '').trim() || null
  const password = req.body?.password ? String(req.body.password) : null
  const pin = req.body?.pin_code ?? req.body?.pin
  const role = req.body?.role === 'admin' || req.body?.role === 'Admin' ? 'admin' : 'cashier'
  if (!name || (!password && !pin)) throw httpError(400, 'name and password or pin are required')
  const result = db.prepare('INSERT INTO employees (name, email, role, password_hash, pin_hash, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(name, email, role, password ? await bcrypt.hash(password, 10) : null, pin ? await bcrypt.hash(String(pin), 10) : null, Number(req.body.active === undefined ? 1 : Boolean(req.body.active)), new Date().toISOString())
  res.status(201).json(serializeEmployee(db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid)))
}))

app.put('/api/employees/:id', requireAdmin, asyncRoute(async (req, res) => {
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(Number(req.params.id))
  if (!existing) throw httpError(404, 'Employee not found')
  const passwordHash = req.body?.password ? await bcrypt.hash(String(req.body.password), 10) : existing.password_hash
  const pinValue = req.body?.pin_code ?? req.body?.pin
  const pinHash = pinValue ? await bcrypt.hash(String(pinValue), 10) : existing.pin_hash
  const role = req.body?.role === 'admin' || req.body?.role === 'Admin' ? 'admin' : req.body?.role === 'cashier' || req.body?.role === 'Cashier' ? 'cashier' : existing.role
  db.prepare('UPDATE employees SET name = ?, email = ?, role = ?, password_hash = ?, pin_hash = ?, active = ? WHERE id = ?').run(String(req.body?.name ?? existing.name), String(req.body?.email ?? existing.email ?? '') || null, role, passwordHash, pinHash, Number(req.body?.active === undefined ? existing.active : Boolean(req.body.active)), existing.id)
  res.json(serializeEmployee(db.prepare('SELECT * FROM employees WHERE id = ?').get(existing.id)))
}))

app.delete('/api/employees/:id', requireAdmin, asyncRoute(async (req, res) => {
  if (Number(req.params.id) === req.employee.id) throw httpError(400, 'You cannot deactivate your own account')
  const result = db.prepare('UPDATE employees SET active = 0 WHERE id = ?').run(Number(req.params.id))
  if (!result.changes) throw httpError(404, 'Employee not found')
  res.sendStatus(204)
}))

app.post('/api/shifts/open', asyncRoute(async (req, res) => {
  const openingCash = Number(req.body?.openingCash)
  if (!Number.isFinite(openingCash) || openingCash < 0) throw httpError(400, 'openingCash must be a non-negative number')
  const existing = db.prepare("SELECT * FROM shifts WHERE employee_id = ? AND status = 'Open' LIMIT 1").get(req.employee.id)
  if (existing) throw httpError(409, 'This employee already has an open shift')
  const openedAt = new Date().toISOString()
  const result = db.prepare("INSERT INTO shifts (employee_id, opening_cash, opened_at, status) VALUES (?, ?, ?, 'Open')").run(req.employee.id, openingCash, openedAt)
  res.status(201).json({ id: Number(result.lastInsertRowid), openingCash, expectedCash: openingCash, variance: 0, startedAt: formatTime(new Date(openedAt)), status: 'Open' })
}))

app.post('/api/shifts/close', asyncRoute(async (req, res) => {
  const closingCash = Number(req.body?.closingCash)
  if (!Number.isFinite(closingCash) || closingCash < 0) throw httpError(400, 'closingCash must be a non-negative number')
  const shift = db.prepare("SELECT * FROM shifts WHERE employee_id = ? AND status = 'Open' ORDER BY id DESC LIMIT 1").get(req.employee.id)
  if (!shift) throw httpError(409, 'No open shift found')
  const cashSales = db.prepare("SELECT COALESCE(SUM(total), 0) AS value FROM orders WHERE cashier_id = ? AND payment = 'Cash' AND status = 'Completed' AND created_at >= ?").get(req.employee.id, shift.opened_at).value
  const expectedCash = Number(shift.opening_cash) + Number(cashSales)
  const variance = closingCash - expectedCash
  const closedAt = new Date().toISOString()
  db.prepare("UPDATE shifts SET closing_cash = ?, expected_cash = ?, variance = ?, closed_at = ?, status = 'Closed' WHERE id = ?").run(closingCash, expectedCash, variance, closedAt, shift.id)
  res.json({ id: shift.id, openingCash: Number(shift.opening_cash), cashSales: Number(cashSales), expectedCash, closingCash, variance, status: 'Closed', closedAt })
}))

app.get('/api/shifts', asyncRoute(async (_req, res) => {
  const rows = db.prepare('SELECT * FROM shifts ORDER BY opened_at DESC LIMIT 50').all()
  res.json(rows.map((row) => ({ id: row.id, employeeId: row.employee_id, openingCash: Number(row.opening_cash), closingCash: row.closing_cash === null ? null : Number(row.closing_cash), expectedCash: row.expected_cash === null ? null : Number(row.expected_cash), variance: row.variance === null ? null : Number(row.variance), openedAt: row.opened_at, closedAt: row.closed_at, status: row.status })))
}))

app.get('/api/reports/summary', asyncRoute(async (_req, res) => res.json(reportSummary())))

app.use((req, res) => res.status(404).json({ message: 'Route not found' }))
app.use((error, _req, res, _next) => sendError(res, error))

async function start() {
  db = await database.initializeDatabase()
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cake POS API listening on 0.0.0.0:${PORT}`)
    console.log(`Database: ${database.databasePath}`)
    console.log(`CORS origins: ${corsOrigins.join(', ') || '(none configured)'}`)
  })
}

start().catch((error) => {
  console.error(error)
  process.exit(1)
})
