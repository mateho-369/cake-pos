export type PageId =
  | 'overview'
  | 'orders'
  | 'products'
  | 'freshness'
  | 'categories'
  | 'employees'
  | 'shifts'
  | 'reports'
  | 'settings'

export type ProductStatus = 'Fresh' | '1 day left' | 'Expires today' | 'Expired'

export type Product = {
  id: number
  name: string
  category: string
  price: number
  stock: number
  sold: number
  revenue: number
  status: ProductStatus
  madeAt: string
  bestBefore: string
  imagePosition: string
  active: boolean
}

export type Order = {
  id: string
  time: string
  date: string
  cashier: string
  items: number
  total: number
  payment: 'Cash' | 'KHQR'
  status: 'Completed' | 'Refunded' | 'Voided'
  detail: string[]
}

export type Category = {
  id: number
  name: string
  items: number
  active: number
  revenue: number
  color: string
  sortOrder?: number
}

export type Employee = {
  id: number
  name: string
  initials: string
  email?: string
  role: string
  status: string
  shift: string
  sales: number
  orders: number
}

export type RevenuePoint = { day: string; value: number }
export type TopProduct = { id: number; name: string; category: string; units: number; revenue: number }
export type ReportSummary = { todaySalesTotal: number; todayOrdersCount: number; revenueData: RevenuePoint[]; topProducts: TopProduct[] }
