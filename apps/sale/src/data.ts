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
  /** Id of the chosen category (stable across renames). Optional. */
  categoryId?: number
  // Null price tolerated for legacy/partial payloads; formatters treat it as 0.
  price: number | null
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

export type CartItem = {
  product: Product
  quantity: number
  /**
   * Set when the line was put in the cart by resuming a held order. At
   * checkout these ids tell the server which holds this sale pays for — and
   * because it lives on the LINE, removing the line (or clearing the cart)
   * stops the hold being released by an unrelated sale.
   */
  fromHoldId?: string
}
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
  total: number | null
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
    // A hold that was resumed and paid at checkout is closed as Released
    // (never Cancelled) so reports don't double-count the sale.
    | 'Released'
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

/**
 * An open Telegram customer order waiting in the pending-orders panel.
 * The customer placed it in the Mini App; staff verify it by phone or
 * Telegram message, then take payment when the customer arrives.
 */
export type PendingOrder = {
  id: string
  pickupCode?: string | null
  isStale?: boolean
  createdAt: string
  status: string
  total: number | null
  detail: string[]
  customer?: {
    name: string
    phone?: string
    telegram_username?: string | null
    /** Telegram chat id — set for every Mini App customer, enables "Message". */
    telegramUserId?: string | null
  } | null
}
