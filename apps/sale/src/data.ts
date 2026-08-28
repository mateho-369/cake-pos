export type Freshness = 'fresh' | 'tomorrow' | 'today'

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
  imagePosition: string
  freshness: Freshness
  bestBefore: string
  imageUrl?: string
  images?: ProductImage[]
  sold?: number
  revenue?: number
  status?: 'Fresh' | '1 day left' | 'Expires today' | 'Expired'
  madeAt?: string
  active?: boolean
}

export type CartItem = { product: Product; quantity: number }
export type SaleCategory = {
  id: number
  name: string
  color?: string
  active?: number
  items?: number
  revenue?: number
  parentId?: number | null
  parentName?: string | null
}
export type SaleOrder = {
  id: string
  time: string
  date: string
  createdAt: string
  cashier: string
  source: 'walk-in' | 'telegram'
  items: number
  subtotal?: number
  discountType?: 'percentage' | 'fixed' | null
  discountValue?: number | null
  discountAmount?: number
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
    // Orders parked at the terminal for a customer who pays later.
    | 'Held'
    | 'Cancelled'
  detail: string[]
  /** Optional label the cashier typed when holding ("Dara — 4pm"). */
  holdLabel?: string | null
  /**
   * Line items, present on held orders so a hold can be put straight back
   * into the cart (GET /api/orders/held eager-loads them).
   */
  lineItems?: Array<{
    productId: number | null
    description: string | null
    quantity: number
    unitPriceCents: number
  }>
}

/** A held (parked) order shown in the terminal's held-orders queue. */
export type HeldOrder = SaleOrder & {
  status: 'Held'
  lineItems: NonNullable<SaleOrder['lineItems']>
}
