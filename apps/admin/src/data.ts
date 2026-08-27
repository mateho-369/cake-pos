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
  /**
   * Number of order_items rows referencing this product. Present on the
   * catalog list response; > 0 means the product cannot be hard-deleted.
   */
  orderItemReferences?: number
  /**
   * Admin override (default false): hide the product from the customer
   * storefront entirely once stock hits 0, instead of showing it with an
   * "Out of stock" label. Kept separate from `active` on purpose.
   */
  hideWhenOutOfStock?: boolean
}

export type Order = {
  id: string
  pickupCode?: string | null
  isStale?: boolean
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
  cashSalesUsdCents?: number
  cashSalesKhr?: number
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
  yesterdaySalesTotal?: number
  yesterdayOrdersCount?: number
  itemsSold?: number
  qrPaymentCount?: number
  ordersData?: RevenuePoint[]
  revenueData: RevenuePoint[]
  topProducts: TopProduct[]
}

export type WasteEvent = {
  id: number
  productName: string
  category: string | null
  quantity: number
  reason: string
  retailValue: number
  recordedAt: string
  recordedBy: string | null
}

export type FreshnessReport = {
  totalUnits: number
  freshUnits: number
  freshValueCents: number
  freshPercent: number
  expiresTodayUnits: number
  expiresTodayValueCents: number
  expiresTomorrowUnits: number
  expiresTomorrowValueCents: number
  expiredUnits: number
  expiredValueCents: number
  wasteThisWeekCents: number
  wasteLastWeekCents: number
  wasteDeltaPercent: number | null
  dailyWaste: RevenuePoint[]
  events: WasteEvent[]
  lastRecordedAt: string | null
}
