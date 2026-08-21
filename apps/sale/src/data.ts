export type Freshness = 'fresh' | 'tomorrow' | 'today'

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
  sold?: number
  revenue?: number
  status?: 'Fresh' | '1 day left' | 'Expires today' | 'Expired'
  madeAt?: string
  active?: boolean
}

export type CartItem = { product: Product; quantity: number }
export type SaleCategory = { id: number; name: string; color?: string; active?: number; items?: number; revenue?: number }
export type SaleOrder = { id: string; time: string; date: string; cashier: string; items: number; total: number; payment: 'Cash' | 'KHQR'; status: 'Completed' | 'Refunded' | 'Voided'; detail: string[] }
