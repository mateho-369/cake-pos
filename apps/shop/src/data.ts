export type Product = {
  id: number
  name: string
  category: string
  price: number
  stock: number
  imagePosition: string
  imageUrl?: string | null
  bestBefore: string
  status?: 'Fresh' | '1 day left' | 'Expires today' | 'Expired'
  active?: boolean
}
