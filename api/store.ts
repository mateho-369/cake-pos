import type {
  CartLine,
  Category,
  DashboardStats,
  DbState,
  Employee,
  Order,
  PaymentMethod,
  Product,
  Role,
  Settings,
  Shift,
} from './types'
import { addDays, localISODate, uid } from './money'
import { createSeed } from './seed'

let state: DbState = createSeed()
const listeners = new Set<() => void>()

function persist() {
  listeners.forEach((fn) => fn())
}

function mutate(fn: (draft: DbState) => void) {
  fn(state)
  persist()
}

export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getState(): DbState {
  return state
}

export function resetDemo() {
  state = createSeed()
  persist()
}

export const db = {
  get: getState,
  subscribe,
  resetDemo,

  findByPin(pin: string) {
    const employee = state.employees.find((e) => e.active && e.pinCode === pin)
    if (!employee) throw new Error('That PIN is not recognised.')
    return employee
  },

  findByEmail(email: string, password: string) {
    const employee = state.employees.find(
      (e) => e.active && e.email?.toLowerCase() === email.trim().toLowerCase() && e.password === password,
    )
    if (!employee) throw new Error('Email or password does not match.')
    return employee
  },

  findById(id: string) {
    return state.employees.find((e) => e.id === id) ?? null
  },

  openShift(me: Employee, openingCash: number) {
    if (db.activeShift(me.id)) throw new Error('A shift is already open.')
    const shift: Shift = {
      id: uid('sh'),
      cashierId: me.id,
      cashierName: me.name,
      openedAt: new Date().toISOString(),
      closedAt: null,
      openingCash,
      closingCash: null,
      cashSales: 0,
      expectedCash: null,
      variance: null,
    }
    mutate((s) => {
      s.shifts.unshift(shift)
    })
    return shift
  },

  activeShift(employeeId: string): Shift | null {
    return state.shifts.find((sh) => sh.cashierId === employeeId && !sh.closedAt) ?? null
  },

  closeShift(employeeId: string, closingCash: number) {
    const shift = db.activeShift(employeeId)
    if (!shift) throw new Error('No open shift.')
    const expected = shift.openingCash + shift.cashSales
    mutate((s) => {
      const row = s.shifts.find((sh) => sh.id === shift.id)
      if (!row) return
      row.closedAt = new Date().toISOString()
      row.closingCash = closingCash
      row.expectedCash = expected
      row.variance = closingCash - expected
    })
  },

  products() {
    return state.products.filter((p) => p.isActive)
  },

  allProducts() {
    return state.products
  },

  categories() {
    return [...state.categories].sort((a, b) => a.sortOrder - b.sortOrder)
  },

  createProduct(input: {
    name: string
    price: number
    categoryId: string
    imageUrl: string
    madeToday: boolean
    stockQty: number
  }) {
    const madeAt = input.madeToday ? localISODate() : localISODate()
    const product: Product = {
      id: uid('p'),
      name: input.name.trim(),
      price: input.price,
      categoryId: input.categoryId,
      imageUrl: input.imageUrl,
      madeAt,
      bestBefore: addDays(madeAt, state.settings.bestBeforeDays),
      stockQty: input.stockQty,
      isActive: true,
    }
    mutate((s) => {
      s.products.unshift(product)
    })
    return product
  },

  updateProduct(id: string, patch: Partial<Product>) {
    mutate((s) => {
      const row = s.products.find((p) => p.id === id)
      if (!row) return
      Object.assign(row, patch)
      if (patch.madeAt) row.bestBefore = addDays(patch.madeAt, s.settings.bestBeforeDays)
    })
  },

  removeProduct(id: string) {
    mutate((s) => {
      const row = s.products.find((p) => p.id === id)
      if (row) row.isActive = false
    })
  },

  createCategory(name: string) {
    const category: Category = {
      id: uid('cat'),
      name: name.trim(),
      sortOrder: state.categories.length + 1,
    }
    mutate((s) => s.categories.push(category))
    return category
  },

  updateCategory(id: string, name: string) {
    mutate((s) => {
      const row = s.categories.find((c) => c.id === id)
      if (row) row.name = name.trim()
    })
  },

  removeCategory(id: string) {
    mutate((s) => {
      s.categories = s.categories.filter((c) => c.id !== id)
    })
  },

  checkout(cart: CartLine[], payment: PaymentMethod, cashTendered?: number) {
    const me = db.me()
    if (!me) throw new Error('Sign in first.')
    if (!cart.length) throw new Error('Cart is empty.')
    const shift = db.activeShift()
    if (!shift) throw new Error('Open a shift before taking orders.')

    const items = cart.map((line) => ({
      productId: line.productId,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.unitPrice * line.quantity,
    }))
    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0)
    const seq = 1840 + state.orders.length + 1
    const order: Order = {
      id: uid('ord'),
      orderNumber: `BLM-${String(seq).padStart(4, '0')}`,
      cashierId: me.id,
      cashierName: me.name,
      items,
      subtotal,
      discount: 0,
      total: subtotal,
      paymentMethod: payment,
      status: 'completed',
      cashTendered,
      change: payment === 'cash' && cashTendered !== undefined ? cashTendered - subtotal : undefined,
      createdAt: new Date().toISOString(),
    }

    mutate((s) => {
      s.orders.unshift(order)
      for (const line of cart) {
        const p = s.products.find((x) => x.id === line.productId)
        if (p) p.stockQty = Math.max(0, p.stockQty - line.quantity)
      }
      const sh = s.shifts.find((x) => x.id === shift.id)
      if (sh && payment === 'cash') sh.cashSales += subtotal
    })
    return order
  },

  orders() {
    return state.orders
  },

  employees() {
    return state.employees
  },

  createEmployee(input: {
    name: string
    email: string
    password: string
    pinCode: string
    role: Role
  }) {
    if (state.employees.some((e) => e.pinCode === input.pinCode)) {
      throw new Error('That PIN is already in use.')
    }
    if (state.employees.some((e) => e.email?.toLowerCase() === input.email.toLowerCase())) {
      throw new Error('That email is already in use.')
    }
    const employee: Employee = {
      id: uid('emp'),
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      password: input.password,
      pinCode: input.pinCode,
      role: input.role,
      active: true,
    }
    mutate((s) => s.employees.push(employee))
    return employee
  },

  updateEmployee(id: string, patch: Partial<Employee>) {
    mutate((s) => {
      const row = s.employees.find((e) => e.id === id)
      if (row) Object.assign(row, patch)
    })
  },

  shifts() {
    return state.shifts
  },

  settings(): Settings {
    return state.settings
  },

  updateSettings(patch: Partial<Settings>) {
    mutate((s) => {
      Object.assign(s.settings, patch)
    })
  },

  dashboard(): DashboardStats {
    const today = localISODate()
    const yesterday = addDays(today, -1)
    const todayOrders = state.orders.filter((o) => o.status === 'completed' && o.createdAt.slice(0, 10) === today)
    const yOrders = state.orders.filter((o) => o.status === 'completed' && o.createdAt.slice(0, 10) === yesterday)
    const todaySales = todayOrders.reduce((s, o) => s + o.total, 0)
    const yesterdaySales = yOrders.reduce((s, o) => s + o.total, 0)

    const revenue7d = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, i - 6)
      const total = state.orders
        .filter((o) => o.status === 'completed' && o.createdAt.slice(0, 10) === date)
        .reduce((s, o) => s + o.total, 0)
      return { date, total }
    })

    const tally = new Map<string, { name: string; qty: number; total: number }>()
    for (const order of state.orders.filter((o) => o.status === 'completed')) {
      for (const item of order.items) {
        const row = tally.get(item.name) ?? { name: item.name, qty: 0, total: 0 }
        row.qty += item.quantity
        row.total += item.lineTotal
        tally.set(item.name, row)
      }
    }
    const topCakes = [...tally.values()].sort((a, b) => b.qty - a.qty).slice(0, 5)

    const nearExpiry = state.products.filter((p) => {
      if (!p.isActive) return false
      const d = Math.round(
        (new Date(p.bestBefore + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86_400_000,
      )
      return d <= 1
    }).length

    return {
      todaySales,
      yesterdaySales,
      ordersToday: todayOrders.length,
      nearExpiry,
      activeShift: state.shifts.find((s) => !s.closedAt) ?? null,
      revenue7d,
      topCakes,
    }
  },
}


