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
}

export type CartItem = {
  product: Product
  quantity: number
}

export const categories = ['All', 'Signature', 'Whole cakes', 'Mini cakes', 'Slices', 'Cupcakes', 'Drinks']

export const initialProducts: Product[] = [
  { id: 1, name: 'Strawberry Cloud', category: 'Signature', price: 28, stock: 4, imagePosition: '0% 0%', freshness: 'fresh', bestBefore: 'Aug 23' },
  { id: 2, name: 'Dark Ganache', category: 'Whole cakes', price: 32, stock: 2, imagePosition: '50% 0%', freshness: 'tomorrow', bestBefore: 'Aug 21' },
  { id: 3, name: 'Matcha Pistachio', category: 'Signature', price: 34, stock: 7, imagePosition: '100% 0%', freshness: 'fresh', bestBefore: 'Aug 23' },
  { id: 4, name: 'Berry Basque', category: 'Whole cakes', price: 30, stock: 3, imagePosition: '0% 100%', freshness: 'today', bestBefore: 'Today' },
  { id: 5, name: 'Raspberry Petite', category: 'Mini cakes', price: 12, stock: 9, imagePosition: '50% 100%', freshness: 'fresh', bestBefore: 'Aug 23' },
  { id: 6, name: 'Cocoa Cupcake Trio', category: 'Cupcakes', price: 9, stock: 8, imagePosition: '100% 100%', freshness: 'tomorrow', bestBefore: 'Aug 21' },
  { id: 7, name: 'Strawberry Slice', category: 'Slices', price: 5.5, stock: 12, imagePosition: '0% 0%', freshness: 'fresh', bestBefore: 'Aug 22' },
  { id: 8, name: 'Ganache Slice', category: 'Slices', price: 6, stock: 10, imagePosition: '50% 0%', freshness: 'fresh', bestBefore: 'Aug 22' },
  { id: 9, name: 'Matcha Mini', category: 'Mini cakes', price: 11, stock: 6, imagePosition: '100% 0%', freshness: 'today', bestBefore: 'Today' },
  { id: 10, name: 'Basque Slice', category: 'Slices', price: 6.5, stock: 5, imagePosition: '0% 100%', freshness: 'tomorrow', bestBefore: 'Aug 21' },
  { id: 11, name: 'Raspberry Celebration', category: 'Whole cakes', price: 38, stock: 3, imagePosition: '50% 100%', freshness: 'fresh', bestBefore: 'Aug 23' },
  { id: 12, name: 'Chocolate Cupcake', category: 'Cupcakes', price: 3.5, stock: 14, imagePosition: '100% 100%', freshness: 'fresh', bestBefore: 'Aug 22' },
  { id: 13, name: 'Iced Latte', category: 'Drinks', price: 3.5, stock: 30, imagePosition: '50% 0%', freshness: 'fresh', bestBefore: 'Made to order' },
  { id: 14, name: 'Americano', category: 'Drinks', price: 2.5, stock: 30, imagePosition: '50% 0%', freshness: 'fresh', bestBefore: 'Made to order' },
]
