const path = require('node:path')
const bcrypt = require('bcryptjs')
const { createSqliteStore } = require('./sqlite')

const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'cake-pos.sqlite')
let db

function createSchema() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'cashier')),
    password_hash TEXT,
    pin_hash TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#be185d',
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL CHECK (price >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    sold INTEGER NOT NULL DEFAULT 0 CHECK (sold >= 0),
    revenue REAL NOT NULL DEFAULT 0 CHECK (revenue >= 0),
    made_at TEXT NOT NULL,
    best_before TEXT NOT NULL,
    image_position TEXT NOT NULL DEFAULT '0% 0%',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    cashier_id INTEGER NOT NULL REFERENCES employees(id),
    time TEXT NOT NULL,
    date TEXT NOT NULL,
    items INTEGER NOT NULL,
    total REAL NOT NULL CHECK (total >= 0),
    payment TEXT NOT NULL CHECK (payment IN ('Cash', 'KHQR')),
    status TEXT NOT NULL CHECK (status IN ('Completed', 'Refunded', 'Voided')),
    detail_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price REAL NOT NULL CHECK (unit_price >= 0)
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    opening_cash REAL NOT NULL CHECK (opening_cash >= 0),
    closing_cash REAL,
    expected_cash REAL,
    variance REAL,
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('Open', 'Closed'))
  );
`)
}

const iso = (date) => new Date(date).toISOString()
const now = iso(new Date())

function seed() {
  const employeeCount = db.prepare('SELECT COUNT(*) AS count FROM employees').get().count
  if (employeeCount > 0) return

  const insertEmployee = db.prepare(`INSERT INTO employees (name, email, role, password_hash, pin_hash, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`)
  const passwordHash = (value) => bcrypt.hashSync(value, 10)
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'owner@atelier.local'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!'
  const adminPin = process.env.SEED_ADMIN_PIN || '9999'
  const cashierEmail = process.env.SEED_CASHIER_EMAIL || 'sophea@atelier.local'
  const cashierPassword = process.env.SEED_CASHIER_PASSWORD || 'ChangeMe123!'
  const cashierPin = process.env.SEED_CASHIER_PIN || '1234'

  insertEmployee.run('Makara Piseth', adminEmail, 'admin', passwordHash(adminPassword), passwordHash(adminPin), now)
  insertEmployee.run('Sophea Chan', cashierEmail, 'cashier', passwordHash(cashierPassword), passwordHash(cashierPin), now)
  insertEmployee.run('Dara Lim', 'dara@atelier.local', 'cashier', passwordHash(cashierPassword), passwordHash('5678'), now)

  const categoryRows = [
    ['Signature', '#be185d', 1, 1],
    ['Whole cakes', '#3b82f6', 1, 2],
    ['Mini cakes', '#7c3aed', 1, 3],
    ['Slices', '#d97706', 1, 4],
    ['Cupcakes', '#ec4899', 1, 5],
    ['Drinks', '#059669', 1, 6],
    ['Chocolate', '#92400e', 1, 7],
    ['Birthday Cakes', '#2563eb', 1, 8],
    ['Cheesecakes', '#d97706', 1, 9],
  ]
  const insertCategory = db.prepare('INSERT INTO categories (name, color, active, sort_order) VALUES (?, ?, ?, ?)')
  for (const category of categoryRows) insertCategory.run(...category)

  const products = [
    [1, 'Strawberry Cloud', 'Signature', 28, 4, 18, 504, '2026-08-20', '2026-08-23', '0% 0%', 1],
    [2, 'Dark Ganache', 'Whole cakes', 32, 2, 14, 448, '2026-08-18', '2026-08-21', '50% 0%', 1],
    [3, 'Matcha Pistachio', 'Signature', 34, 7, 11, 374, '2026-08-20', '2026-08-23', '100% 0%', 1],
    [4, 'Berry Basque', 'Whole cakes', 30, 3, 10, 300, '2026-08-17', '2026-08-20', '0% 100%', 1],
    [5, 'Raspberry Petite', 'Mini cakes', 12, 9, 7, 84, '2026-08-20', '2026-08-23', '50% 100%', 1],
    [6, 'Cocoa Cupcake Trio', 'Cupcakes', 9, 8, 22, 198, '2026-08-19', '2026-08-21', '100% 100%', 1],
    [7, 'Strawberry Slice', 'Slices', 5.5, 12, 18, 99, '2026-08-20', '2026-08-22', '0% 0%', 1],
    [8, 'Ganache Slice', 'Slices', 6, 10, 16, 96, '2026-08-20', '2026-08-22', '50% 0%', 1],
    [9, 'Matcha Mini', 'Mini cakes', 11, 6, 9, 99, '2026-08-19', '2026-08-20', '100% 0%', 1],
    [10, 'Basque Slice', 'Slices', 6.5, 5, 8, 52, '2026-08-19', '2026-08-21', '0% 100%', 1],
    [11, 'Raspberry Celebration', 'Whole cakes', 38, 3, 6, 228, '2026-08-20', '2026-08-23', '50% 100%', 1],
    [12, 'Chocolate Cupcake', 'Cupcakes', 3.5, 14, 20, 70, '2026-08-20', '2026-08-22', '100% 100%', 1],
    [13, 'Iced Latte', 'Drinks', 3.5, 30, 0, 0, '2026-08-20', 'Made to order', '50% 0%', 1],
    [14, 'Americano', 'Drinks', 2.5, 30, 0, 0, '2026-08-20', 'Made to order', '50% 0%', 1],
  ]
  const insertProduct = db.prepare(`INSERT INTO products (id, name, category, price, stock, sold, revenue, made_at, best_before, image_position, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  for (const product of products) insertProduct.run(...product, now, now)

  const insertOrder = db.prepare(`INSERT INTO orders (id, cashier_id, time, date, items, total, payment, status, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const seedOrders = [
    ['CS-1048', 2, '10:42 AM', 'Today', 3, 46.5, 'KHQR', 'Completed', ['Strawberry Cloud × 1', 'Cocoa Mini × 1', 'Iced latte × 1']],
    ['CS-1047', 3, '10:31 AM', 'Today', 2, 60, 'Cash', 'Completed', ['Dark Ganache × 1', 'Strawberry Cloud × 1']],
    ['CS-1046', 2, '10:08 AM', 'Today', 4, 74, 'KHQR', 'Completed', ['Matcha Pistachio × 1', 'Cocoa Mini × 2', 'Americano × 1']],
    ['CS-1045', 3, '9:52 AM', 'Today', 1, 30, 'Cash', 'Refunded', ['Berry Basque × 1']],
    ['CS-1044', 2, '9:34 AM', 'Today', 2, 50, 'KHQR', 'Completed', ['Vanilla Celebration × 1', 'Cocoa Mini × 1']],
    ['CS-1043', 3, '9:11 AM', 'Today', 2, 62, 'Cash', 'Completed', ['Dark Ganache × 1', 'Berry Basque × 1']],
  ]
  for (const order of seedOrders) insertOrder.run(order[0], order[1], order[2], order[3], order[4], order[5], order[6], order[7], JSON.stringify(order[8]), now)
}

async function initializeDatabase() {
  db = await createSqliteStore(databasePath)
  createSchema()
  seed()
  return db
}

module.exports = { databasePath, initializeDatabase, get db() { return db } }
