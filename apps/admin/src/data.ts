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
  /** The authoritative category id (rename-safe) for pickers/saves. */
  categoryId?: number
  // The backend requires a price and refuses to save without one, but a
  // legacy/partial payload can still carry null. All money rendering uses a
  // null-safe formatter so a bad row never crashes the catalog page.
  price: number | null
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
    telegramUserId?: string
  } | null
  customerId?: number | null
  source: 'walk-in' | 'telegram'
  items: number
  subtotal?: number
  discountType?: 'percentage' | 'fixed' | null
  discountValue?: number | null
  discountAmount?: number
  originalOrderId?: string | null
  holdLabel?: string | null
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
    | 'Held'
    | 'Cancelled'
    | 'Released'
  paymentStatus?: string
  fulfillmentStatus?: string
  statusChange?: {
    fromStatus?: string | null
    toStatus?: string | null
    reason?: string | null
    paidOrderId?: string | null
  } | null
  lineItems?: Array<{
    productId: number | null
    description: string | null
    quantity: number
    /**
     * The customer's free-text instruction for this line, typed in the
     * Telegram Mini App ("Happy Birthday John"). Null on walk-in lines.
     */
    note?: string | null
    unitPriceCents: number
    lineTotalCents?: number
  }>
  payments?: Array<{
    id: number
    method: string
    status: string
    amountUsdCents: number
    exchangeRateKhrPerUsd: number
    tenderedUsdCents?: number | null
    tenderedKhr?: number | null
    changeUsdCents?: number | null
    changeKhr?: number | null
    settlementRoundingKhr?: number | null
    confirmedByEmployeeId?: number | null
    confirmedAt?: string | null
  }>
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
  /** Null for a top-level category; the parent's id for a subcategory. */
  parentId?: number | null
  parentName?: string | null
  items: number
  active: number
  revenue: number
  color: string
  sortOrder?: number
  /** True for a cashier-proposed category the owner has not reviewed yet. */
  pendingReview?: boolean
  /** Name of the employee who proposed it, when known. */
  createdBy?: string | null
  createdAt?: string | null
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
