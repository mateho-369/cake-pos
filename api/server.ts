import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { randomBytes } from 'node:crypto'
import { db } from './store'
import type { Employee } from './types'

const PORT = Number(process.env.PORT || 8080)

/**
 * Production: CORS_ORIGINS=https://sale.yourdomain.com,https://admin.yourdomain.com
 * Dev / Arena preview: reflect the request Origin so unknown preview hosts work.
 * Never uses cookies — Authorization: Bearer only — so Allow-Credentials is off.
 */
const configuredOrigins = (process.env.CORS_ORIGINS || 'https://sale.yourdomain.com,https://admin.yourdomain.com')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const isProd = process.env.NODE_ENV === 'production'

const app = new Hono()

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return configuredOrigins[0]
      if (!isProd) return origin
      return configuredOrigins.includes(origin) ? origin : ''
    },
    allowHeaders: ['Authorization', 'Content-Type', 'Accept'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
    credentials: false,
  }),
)

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  const message = err instanceof Error ? err.message : 'Server error'
  const status = /not recognised|does not match|Sign in|empty|already/i.test(message) ? 422 : 500
  return c.json({ error: message }, status as 422 | 500)
})

const tokens = new Map<string, string>()

function publicUser(employee: Employee) {
  const { password: _password, ...rest } = employee
  return rest
}

function bearer(c: { req: { header: (name: string) => string | undefined } }) {
  const header = c.req.header('Authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

function requireUser(c: { req: { header: (name: string) => string | undefined } }) {
  const token = bearer(c)
  if (!token) throw new HTTPException(401, { message: 'Missing bearer token.' })
  const employeeId = tokens.get(token)
  if (!employeeId) throw new HTTPException(401, { message: 'Invalid or expired token.' })
  const employee = db.findById(employeeId)
  if (!employee || !employee.active) throw new HTTPException(401, { message: 'Invalid or expired token.' })
  return { token, employee }
}

function requireAdmin(c: { req: { header: (name: string) => string | undefined } }) {
  const ctx = requireUser(c)
  if (ctx.employee.role !== 'admin') throw new HTTPException(403, { message: 'Admin only.' })
  return ctx
}

function issueToken(employee: Employee) {
  const token = randomBytes(32).toString('hex')
  tokens.set(token, employee.id)
  return { token, user: publicUser(employee) }
}

const api = new Hono()

api.get('/up', (c) => c.json({ ok: true }))

api.post('/auth/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>()
  const employee = db.findByEmail(body.email || '', body.password || '')
  return c.json(issueToken(employee))
})

api.post('/auth/login-pin', async (c) => {
  const body = await c.req.json<{ pin?: string }>()
  const employee = db.findByPin(body.pin || '')
  return c.json(issueToken(employee))
})

api.get('/auth/me', (c) => {
  const { employee } = requireUser(c)
  return c.json({ user: publicUser(employee) })
})

api.post('/auth/logout', (c) => {
  const token = bearer(c)
  if (token) tokens.delete(token)
  return c.json({ ok: true })
})

api.get('/products', (c) => {
  requireUser(c)
  return c.json(db.products())
})

api.post('/products', async (c) => {
  requireUser(c)
  const body = await c.req.json<{
    name: string
    price: number
    categoryId: string
    imageUrl: string
    madeToday: boolean
    stockQty: number
  }>()
  return c.json(db.createProduct(body), 201)
})

api.put('/products/:id', async (c) => {
  requireUser(c)
  const id = c.req.param('id')
  const patch = await c.req.json()
  db.updateProduct(id, patch)
  const product = db.allProducts().find((p) => p.id === id)
  if (!product) throw new HTTPException(404, { message: 'Product not found.' })
  return c.json(product)
})

api.delete('/products/:id', (c) => {
  requireUser(c)
  db.removeProduct(c.req.param('id'))
  return c.body(null, 204)
})

api.get('/categories', (c) => {
  requireUser(c)
  return c.json(db.categories())
})

api.post('/categories', async (c) => {
  requireAdmin(c)
  const body = await c.req.json<{ name: string }>()
  return c.json(db.createCategory(body.name), 201)
})

api.delete('/categories/:id', (c) => {
  requireAdmin(c)
  db.removeCategory(c.req.param('id'))
  return c.body(null, 204)
})

api.get('/orders', (c) => {
  requireUser(c)
  return c.json(db.orders())
})

api.post('/orders', async (c) => {
  const { employee } = requireUser(c)
  const body = await c.req.json<{
    items: Parameters<typeof db.checkout>[1]
    paymentMethod: Parameters<typeof db.checkout>[2]
    cashTendered?: number
  }>()
  return c.json(db.checkout(employee, body.items, body.paymentMethod, body.cashTendered), 201)
})

api.get('/shifts/current', (c) => {
  const { employee } = requireUser(c)
  return c.json({ shift: db.activeShift(employee.id) })
})

api.get('/shifts', (c) => {
  requireUser(c)
  return c.json(db.shifts())
})

api.post('/shifts/open', async (c) => {
  const { employee } = requireUser(c)
  const body = await c.req.json<{ openingCash: number }>()
  return c.json(db.openShift(employee, body.openingCash), 201)
})

api.post('/shifts/close', async (c) => {
  const { employee } = requireUser(c)
  const body = await c.req.json<{ closingCash: number }>()
  db.closeShift(employee.id, body.closingCash)
  const shift = db.shifts().find((s) => s.cashierId === employee.id && s.closedAt)
  return c.json(shift)
})

api.get('/employees', (c) => {
  requireAdmin(c)
  return c.json(db.employees().map(publicUser))
})

api.post('/employees', async (c) => {
  requireAdmin(c)
  const body = await c.req.json<{
    name: string
    email: string
    password: string
    pinCode: string
    role: 'admin' | 'cashier'
  }>()
  return c.json(publicUser(db.createEmployee(body)), 201)
})

api.patch('/employees/:id', async (c) => {
  requireAdmin(c)
  const id = c.req.param('id')
  const patch = await c.req.json()
  db.updateEmployee(id, patch)
  const employee = db.findById(id)
  if (!employee) throw new HTTPException(404, { message: 'Employee not found.' })
  return c.json(publicUser(employee))
})

api.get('/settings', (c) => {
  requireUser(c)
  return c.json(db.settings())
})

api.put('/settings', async (c) => {
  requireAdmin(c)
  const patch = await c.req.json()
  db.updateSettings(patch)
  return c.json(db.settings())
})

api.get('/reports/dashboard', (c) => {
  requireAdmin(c)
  return c.json(db.dashboard())
})

api.get('/reports', (c) => {
  requireAdmin(c)
  const from = c.req.query('from') || ''
  const to = c.req.query('to') || ''
  const orders = db.orders().filter((o) => {
    const d = o.createdAt.slice(0, 10)
    return o.status === 'completed' && d >= from && d <= to
  })
  const total = orders.reduce((s, o) => s + o.total, 0)
  const cash = orders.filter((o) => o.paymentMethod === 'cash').reduce((s, o) => s + o.total, 0)
  const khqr = orders.filter((o) => o.paymentMethod === 'khqr').reduce((s, o) => s + o.total, 0)
  return c.json({ orders, total, cash, khqr })
})

api.post('/demo/reset', (c) => {
  requireAdmin(c)
  db.resetDemo()
  tokens.clear()
  return c.json({ ok: true })
})

app.route('/api', api)
app.get('/up', (c) => c.json({ ok: true }))

serve({ fetch: app.fetch, hostname: '0.0.0.0', port: PORT }, (info) => {
  console.log(`Bloom API listening on http://0.0.0.0:${info.port}`)
  console.log(`CORS ${isProd ? 'allowlist' : 'reflect'}: ${configuredOrigins.join(', ')}`)
})
