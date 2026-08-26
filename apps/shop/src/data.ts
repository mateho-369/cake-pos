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
  imageUrl?: string | null
  images?: ProductImage[]
  bestBefore: string
  status?: 'Fresh' | '1 day left' | 'Expires today' | 'Expired'
  active?: boolean
}
