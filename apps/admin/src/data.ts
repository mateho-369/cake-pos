export type PageId =
  | 'overview'
  | 'orders'
  | 'products'
  | 'freshness'
  | 'categories'
  | 'employees'
  | 'shifts'
  | 'reports'
  | 'settings'

export type Product = {
  id: number
  name: string
  category: string
  price: number
  stock: number
  sold: number
  revenue: number
  status: 'Fresh' | '1 day left' | 'Expires today' | 'Expired'
  madeAt: string
  bestBefore: string
  imagePosition: string
  active: boolean
}

export type Order = {
  id: string
  time: string
  date: string
  cashier: string
  items: number
  total: number
  payment: 'Cash' | 'KHQR'
  status: 'Completed' | 'Refunded' | 'Voided'
  detail: string[]
}

export const revenueData = [
  { day: 'Mon', value: 642 },
  { day: 'Tue', value: 804 },
  { day: 'Wed', value: 736 },
  { day: 'Thu', value: 918 },
  { day: 'Fri', value: 1044 },
  { day: 'Sat', value: 1328 },
  { day: 'Sun', value: 1186 },
]

export const products: Product[] = [
  {
    id: 1,
    name: 'Strawberry Cloud',
    category: 'Signature Cakes',
    price: 28,
    stock: 4,
    sold: 18,
    revenue: 504,
    status: 'Fresh',
    madeAt: 'Aug 20, 2026',
    bestBefore: 'Aug 23, 2026',
    imagePosition: '0% 0%',
    active: true,
  },
  {
    id: 2,
    name: 'Dark Ganache',
    category: 'Chocolate',
    price: 32,
    stock: 2,
    sold: 14,
    revenue: 448,
    status: '1 day left',
    madeAt: 'Aug 18, 2026',
    bestBefore: 'Aug 21, 2026',
    imagePosition: '100% 0%',
    active: true,
  },
  {
    id: 3,
    name: 'Matcha Pistachio',
    category: 'Signature Cakes',
    price: 34,
    stock: 7,
    sold: 11,
    revenue: 374,
    status: 'Fresh',
    madeAt: 'Aug 20, 2026',
    bestBefore: 'Aug 23, 2026',
    imagePosition: '0% 100%',
    active: true,
  },
  {
    id: 4,
    name: 'Berry Basque',
    category: 'Cheesecakes',
    price: 30,
    stock: 3,
    sold: 10,
    revenue: 300,
    status: 'Expires today',
    madeAt: 'Aug 17, 2026',
    bestBefore: 'Aug 20, 2026',
    imagePosition: '100% 100%',
    active: true,
  },
  {
    id: 5,
    name: 'Vanilla Celebration',
    category: 'Birthday Cakes',
    price: 38,
    stock: 1,
    sold: 7,
    revenue: 266,
    status: 'Fresh',
    madeAt: 'Aug 20, 2026',
    bestBefore: 'Aug 23, 2026',
    imagePosition: '0% 0%',
    active: true,
  },
  {
    id: 6,
    name: 'Cocoa Mini',
    category: 'Mini Cakes',
    price: 12,
    stock: 0,
    sold: 22,
    revenue: 264,
    status: 'Expired',
    madeAt: 'Aug 16, 2026',
    bestBefore: 'Aug 19, 2026',
    imagePosition: '100% 0%',
    active: false,
  },
]

export const orders: Order[] = [
  { id: 'CS-1048', time: '10:42 AM', date: 'Today', cashier: 'Sophea', items: 3, total: 46.5, payment: 'KHQR', status: 'Completed', detail: ['Strawberry Cloud × 1', 'Cocoa Mini × 1', 'Iced latte × 1'] },
  { id: 'CS-1047', time: '10:31 AM', date: 'Today', cashier: 'Dara', items: 2, total: 60, payment: 'Cash', status: 'Completed', detail: ['Dark Ganache × 1', 'Strawberry Cloud × 1'] },
  { id: 'CS-1046', time: '10:08 AM', date: 'Today', cashier: 'Sophea', items: 4, total: 74, payment: 'KHQR', status: 'Completed', detail: ['Matcha Pistachio × 1', 'Cocoa Mini × 2', 'Americano × 1'] },
  { id: 'CS-1045', time: '9:52 AM', date: 'Today', cashier: 'Dara', items: 1, total: 30, payment: 'Cash', status: 'Refunded', detail: ['Berry Basque × 1'] },
  { id: 'CS-1044', time: '9:34 AM', date: 'Today', cashier: 'Sophea', items: 2, total: 50, payment: 'KHQR', status: 'Completed', detail: ['Vanilla Celebration × 1', 'Cocoa Mini × 1'] },
  { id: 'CS-1043', time: '9:11 AM', date: 'Today', cashier: 'Dara', items: 2, total: 62, payment: 'Cash', status: 'Completed', detail: ['Dark Ganache × 1', 'Berry Basque × 1'] },
]

export const employees = [
  { name: 'Makara Piseth', initials: 'MP', role: 'Owner · Admin', status: 'Active', shift: '8:00 AM – now', sales: 0, orders: 0 },
  { name: 'Sophea Chan', initials: 'SC', role: 'Cashier', status: 'On shift', shift: '7:55 AM – now', sales: 648, orders: 24 },
  { name: 'Dara Lim', initials: 'DL', role: 'Cashier', status: 'On shift', shift: '8:02 AM – now', sales: 576, orders: 23 },
  { name: 'Sreyneang Sok', initials: 'SS', role: 'Cashier', status: 'Inactive', shift: 'Yesterday · 8h 12m', sales: 0, orders: 0 },
]

export const categories = [
  { name: 'Signature Cakes', items: 12, active: 11, revenue: 1842, color: '#be185d' },
  { name: 'Birthday Cakes', items: 9, active: 9, revenue: 1324, color: '#3b82f6' },
  { name: 'Cheesecakes', items: 7, active: 6, revenue: 978, color: '#d97706' },
  { name: 'Mini Cakes', items: 14, active: 12, revenue: 864, color: '#7c3aed' },
  { name: 'Beverages', items: 10, active: 10, revenue: 622, color: '#059669' },
]
