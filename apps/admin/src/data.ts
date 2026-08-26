export type PageId =
  | 'overview'
  | 'orders'
  | 'customers'
  | 'products'
  | 'freshness'
  | 'categories'
  | 'employees'
  | 'shifts'
  | 'reports'
  | 'settings'
  | 'media'

export type ProductStatus = 'Fresh' | '1 day left' | 'Expires today' | 'Expired'

export type ProductImage = {
  id?: number | null
  url: string
  caption?: string
  sortOrder?: number
}

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
  imageUrl?: string | null
  images?: ProductImage[]
  active: boolean
}

export type Order = {
  id: string
  time: string
  date: string
  createdAt: string
  cashier: string
  customer?: {
    name: string
    phone?: string
    telegram_username?: string
  } | null
  customerId?: number | null
  source: 'walk-in' | 'telegram'
  items: number
  subtotal?: number
  discountType?: 'percentage' | 'fixed' | null
  discountValue?: number | null
  discountAmount?: number
  originalOrderId?: string | null
  total: number
  payment: 'Cash' | 'KHQR' | null
  status:
    | 'Pending'
    | 'Confirmed'
    | 'Paid'
    | 'Ready'
    | 'Completed'
    | 'Refunded'
    | 'Voided'
  detail: string[]
}

export type Customer = {
  id: number
  telegramUserId: string
  name: string
  phone?: string | null
  telegramUsername?: string | null
  firstSeenAt: string
  totalOrders: number
  totalSpent: number
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

export type Shift = {
  id: number
  employeeId: number
  openingCash: number
  closingCash?: number
  expectedCash?: number
  variance?: number
  openedAt: string
  closedAt?: string
  status: 'Open' | 'Closed'
  openingCashUsdCents: number
  openingCashKhr: number
  expectedCashUsdCents?: number
  expectedCashKhr?: number
  closingCashUsdCents?: number
  closingCashKhr?: number
  varianceUsdCents?: number
  varianceKhr?: number
  openedByEmployeeId?: number
  closedByEmployeeId?: number
  openedBy?: string
}

export type RevenuePoint = { day: string; value: number }
export type TopProduct = {
  id: number
  name: string
  category: string
  units: number
  revenue: number
}
export type ReportSummary = {
  todaySalesTotal: number
  todayOrdersCount: number
  grossSalesCents?: number
  totalDiscountsCents?: number
  netSalesBeforeCorrectionsCents?: number
  refundsCents?: number
  voidsCents?: number
  netRevenueCents?: number
  completedOrderCount?: number
  heldOrderCount?: number
  averageOrderValueCents?: number
  cashRevenueCents?: number
  qrRevenueCents?: number
  revenueData: RevenuePoint[]
  topProducts: TopProduct[]
}
