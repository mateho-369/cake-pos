import type { Category, DbState, Employee, Order, Product, Shift } from './types'
import { addDays, localISODate, mulberry32, uid } from './money'

const ADMIN: Employee = {
  id: 'emp-admin',
  name: 'Sophea Chan',
  email: 'owner@bloom.bakery',
  pinCode: '0000',
  password: 'bloom1234',
  role: 'admin',
  active: true,
}

const DARA: Employee = {
  id: 'emp-dara',
  name: 'Dara Kim',
  email: 'dara@bloom.bakery',
  pinCode: '2468',
  password: 'dara1234',
  role: 'cashier',
  active: true,
}

const MALIS: Employee = {
  id: 'emp-malis',
  name: 'Malis Seng',
  email: 'malis@bloom.bakery',
  pinCode: '1357',
  password: 'malis1234',
  role: 'cashier',
  active: true,
}

const VANN: Employee = {
  id: 'emp-vann',
  name: 'Vann Sok',
  email: 'vann@bloom.bakery',
  pinCode: '9876',
  password: 'vann1234',
  role: 'cashier',
  active: false,
}

const CATEGORIES: Category[] = [
  { id: 'cat-birthday', name: 'Birthday Cakes', sortOrder: 1 },
  { id: 'cat-whole', name: 'Whole Cakes', sortOrder: 2 },
  { id: 'cat-slices', name: 'Rolls & Slices', sortOrder: 3 },
  { id: 'cat-cupcakes', name: 'Cupcakes', sortOrder: 4 },
  { id: 'cat-custom', name: 'Custom Orders', sortOrder: 5 },
]

function product(
  id: string,
  name: string,
  price: number,
  categoryId: string,
  image: string,
  madeOffset: number,
  stock: number,
  days = 2,
): Product {
  const madeAt = addDays(localISODate(), madeOffset)
  return {
    id,
    name,
    price,
    categoryId,
    imageUrl: `/cakes/${image}`,
    madeAt,
    bestBefore: addDays(madeAt, days),
    stockQty: stock,
    isActive: true,
  }
}

function buildProducts(): Product[] {
  return [
    product('p-strawberry', 'Strawberry Cloud', 2450, 'cat-whole', 'strawberry-cloud.jpg', 0, 4),
    product('p-ganache', 'Dark Ganache', 2800, 'cat-whole', 'dark-ganache.jpg', -1, 3),
    product('p-ube', 'Ube Dream', 2600, 'cat-whole', 'ube-dream.jpg', 0, 3),
    product('p-lemon', 'Lemon Chiffon', 2200, 'cat-whole', 'lemon-chiffon.jpg', -1, 2),
    product('p-sesame', 'Black Sesame', 2300, 'cat-whole', 'sesame-chiffon.jpg', 0, 3),
    product('p-mango', 'Mango Shortcake', 2550, 'cat-slices', 'mango-shortcake.jpg', 0, 8),
    product('p-matcha', 'Matcha Swiss Roll', 450, 'cat-slices', 'matcha-roll.jpg', -1, 12),
    product('p-velvet', 'Red Velvet Cupcakes', 350, 'cat-cupcakes', 'velvet-cupcakes.jpg', -2, 6),
    product('p-cocoa', 'Cocoa Cupcakes', 300, 'cat-cupcakes', 'cocoa-cupcakes.jpg', 0, 16),
    product('p-birthday', 'Birthday Bloom', 4800, 'cat-birthday', 'birthday-bloom.jpg', 0, 1),
  ]
}

function atHour(dayOffset: number, hour: number, minute: number) {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, minute, 12, 0)
  return d.toISOString()
}

function buildHistory(products: Product[]): { orders: Order[]; shifts: Shift[] } {
  const rand = mulberry32(20260820)
  const cashiers = [DARA, MALIS]
  const orders: Order[] = []
  const shifts: Shift[] = []
  let seq = 1840

  for (let day = -6; day <= -1; day++) {
    const cashier = cashiers[day % 2 === 0 ? 0 : 1]
    const openedAt = atHour(day, 8, 30)
    const closedAt = atHour(day, 19, 10)
    const openingCash = 5000
    let cashSales = 0
    const n = 7 + Math.floor(rand() * 6)

    for (let i = 0; i < n; i++) {
      const p1 = products[Math.floor(rand() * products.length)]
      const extra = rand() > 0.55 ? products[Math.floor(rand() * products.length)] : null
      const q1 = 1 + Math.floor(rand() * 2)
      const items = [
        { productId: p1.id, name: p1.name, quantity: q1, unitPrice: p1.price, lineTotal: p1.price * q1 },
      ]
      if (extra && extra.id !== p1.id) {
        items.push({
          productId: extra.id,
          name: extra.name,
          quantity: 1,
          unitPrice: extra.price,
          lineTotal: extra.price,
        })
      }
      const subtotal = items.reduce((s, it) => s + it.lineTotal, 0)
      const khqr = rand() > 0.55
      if (!khqr) cashSales += subtotal
      seq += 1
      orders.push({
        id: uid('ord'),
        orderNumber: `BLM-${String(seq).padStart(4, '0')}`,
        cashierId: cashier.id,
        cashierName: cashier.name,
        items,
        subtotal,
        discount: 0,
        total: subtotal,
        paymentMethod: khqr ? 'khqr' : 'cash',
        status: 'completed',
        createdAt: atHour(day, 9 + Math.floor(rand() * 9), Math.floor(rand() * 60)),
      })
    }

    const expected = openingCash + cashSales
    const variance = Math.round((rand() - 0.5) * 200)
    shifts.push({
      id: uid('sh'),
      cashierId: cashier.id,
      cashierName: cashier.name,
      openedAt,
      closedAt,
      openingCash,
      closingCash: expected + variance,
      cashSales,
      expectedCash: expected,
      variance,
    })
  }

  return { orders, shifts }
}

export function createSeed(): DbState {
  const products = buildProducts()
  const { orders, shifts } = buildHistory(products)
  return {
    employees: [ADMIN, DARA, MALIS, VANN],
    categories: CATEGORIES,
    products,
    orders,
    shifts,
    settings: {
      businessName: 'Bloom',
      address: 'Street 240, BKK1, Phnom Penh',
      khqrMerchantName: 'BLOOM CAKE SHOP',
      khqrAccount: 'KHQR · Bakong · static demo',
      bestBeforeDays: 2,
      currency: 'USD',
    },
    session: null,
  }
}
