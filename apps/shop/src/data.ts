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
  // Null price tolerated for legacy/partial payloads; formatters treat it as 0.
  price: number | null
  stock: number
  imagePosition: string
  imageUrl?: string | null
  images?: ProductImage[]
  bestBefore: string
  status?: 'Fresh' | '1 day left' | 'Expires today' | 'Expired'
  active?: boolean
}
