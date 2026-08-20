export type Role = 'admin' | 'cashier'
export type PaymentMethod = 'cash' | 'khqr'
export type OrderStatus = 'completed' | 'voided'

export interface Employee {
  id: string
  name: string
  email: string | null
  pinCode: string | null
  password: string
  role: Role
  active: boolean
}

export interface Category {
  id: string
  name: string
  sortOrder: number
}

export interface Product {
  id: string
  name: string
  price: number
  categoryId: string
  imageUrl: string
  madeAt: string
  bestBefore: string
  stockQty: number
  isActive: boolean
}

export interface CartLine {
  productId: string
  name: string
  imageUrl: string
  unitPrice: number
  quantity: number
}

export interface OrderItem {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface Order {
  id: string
  orderNumber: string
  cashierId: string
  cashierName: string
  items: OrderItem[]
  subtotal: number
  discount: number
  total: number
  paymentMethod: PaymentMethod
  status: OrderStatus
  cashTendered?: number
  change?: number
  createdAt: string
}

export interface Shift {
  id: string
  cashierId: string
  cashierName: string
  openedAt: string
  closedAt: string | null
  openingCash: number
  closingCash: number | null
  cashSales: number
  expectedCash: number | null
  variance: number | null
}

export interface Settings {
  businessName: string
  address: string
  khqrMerchantName: string
  khqrAccount: string
  bestBeforeDays: 2 | 3
  currency: 'USD'
}

export interface Session {
  employeeId: string
}

export interface DbState {
  employees: Employee[]
  categories: Category[]
  products: Product[]
  orders: Order[]
  shifts: Shift[]
  settings: Settings
  session: Session | null
}

export interface DashboardStats {
  todaySales: number
  yesterdaySales: number
  ordersToday: number
  nearExpiry: number
  activeShift: Shift | null
  revenue7d: { date: string; total: number }[]
  topCakes: { name: string; qty: number; total: number }[]
}
