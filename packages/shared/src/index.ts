export type {
  AuthUser,
} from './lib/api'
export { api, apiBase, ApiError, getBearer, setBearer, uploadWithTimeout } from './lib/api'
export { DEMO } from './lib/demo'
export { money, parseMoney, duration, formatDay, formatDateTime, formatTime, addDays, localISODate } from './lib/money'
export { freshness, freshnessBadge, freshnessLabel } from './lib/freshness'
export { AuthProvider, useAuth } from './contexts/AuthContext'
export type {
  Role,
  PaymentMethod,
  OrderStatus,
  Employee,
  Category,
  Product,
  CartLine,
  OrderItem,
  Order,
  Shift,
  Settings,
  DashboardStats,
} from './types'
