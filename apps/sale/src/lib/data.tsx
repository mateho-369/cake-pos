import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useStaffAuth } from '../auth/StaffAuthContext'
import { apiRequest } from './api'
import type { Product, SaleCategory, SaleOrder } from '../data'

type ApiProduct = {
  id: number
  name: string
  category: string
  price: number
  stock: number
  sold: number
  revenue: number
  status: Product['status']
  madeAt: string
  bestBefore: string
  imagePosition: string
  imageUrl?: string
  active: boolean
}
type ProductInput = {
  name: string
  category: string
  price: number
  stock: number
  madeAt?: string
  bestBefore?: string
  imagePosition?: string
  imageUrl?: string
  active?: boolean
}
type ShiftResult = {
  id: number
  openingCash: number
  expectedCash: number
  cashSales?: number
  closingCash?: number
  variance: number
  startedAt?: string
  status: 'Open' | 'Closed'
  closedAt?: string
}

type SaleDataContextValue = {
  products: Product[]
  orders: SaleOrder[]
  categories: string[]
  nextOrderNumber: number
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createProduct: (input: ProductInput) => Promise<Product>
  createOrder: (input: {
    payment: 'Cash' | 'KHQR'
    items: Array<{ productId: number; quantity: number }>
    discount?: { type: 'percentage' | 'fixed'; amount: string }
    idempotencyKey?: string
    confirmed?: boolean
    usdReceivedCents?: number
    khrReceived?: number
    changeUsdCents?: number
    changeKhr?: number
    exchangeRateKhrPerUsd?: number
  }) => Promise<SaleOrder>
  openShift: (openingCash: number) => Promise<ShiftResult>
  closeShift: (closingCash: number) => Promise<ShiftResult>
}

const SaleDataContext = createContext<SaleDataContextValue | null>(null)
const terminalCategoryNames = [
  'Signature',
  'Whole cakes',
  'Mini cakes',
  'Slices',
  'Cupcakes',
  'Drinks',
]

function mapProduct(product: ApiProduct): Product {
  return {
    ...product,
    freshness:
      product.status === 'Expires today'
        ? 'today'
        : product.status === '1 day left'
          ? 'tomorrow'
          : 'fresh',
  }
}

export function SaleDataProvider({ children }: { children: ReactNode }) {
  const { token } = useStaffAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<SaleOrder[]>([])
  const [categoryNames, setCategoryNames] = useState<string[]>([])
  const [nextOrderNumber, setNextOrderNumber] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token) {
      setProducts([])
      setOrders([])
      setCategoryNames([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [apiProducts, apiCategories, apiOrders] = await Promise.all([
        apiRequest<ApiProduct[]>('/api/products'),
        apiRequest<SaleCategory[]>('/api/categories'),
        apiRequest<SaleOrder[]>('/api/orders'),
      ])
      const mappedProducts = apiProducts
        .filter((product) => product.active)
        .map(mapProduct)
      const productCategories = mappedProducts.map(
        (product) => product.category,
      )
      const availableCategories = [
        ...new Set(
          apiCategories
            .map((category) => category.name)
            .filter((name) => productCategories.includes(name)),
        ),
      ]
      const visibleCategories = [
        ...terminalCategoryNames.filter((name) =>
          availableCategories.includes(name),
        ),
        ...availableCategories.filter(
          (name) => !terminalCategoryNames.includes(name),
        ),
      ]
      setProducts(mappedProducts)
      setOrders(apiOrders)
      setCategoryNames(visibleCategories)
      const highestOrder = apiOrders.reduce(
        (highest, order) =>
          Math.max(highest, Number(order.id.replace(/^CS-/, '')) || 0),
        0,
      )
      setNextOrderNumber(highestOrder + 1)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to load sale data',
      )
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createProduct = useCallback(
    async (input: ProductInput) => {
      const result = await apiRequest<ApiProduct>('/api/products', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      await refresh()
      return mapProduct(result)
    },
    [refresh],
  )

  const createOrder = useCallback(
    async (input: {
      payment: 'Cash' | 'KHQR'
      items: Array<{ productId: number; quantity: number }>
      discount?: { type: 'percentage' | 'fixed'; amount: string }
      idempotencyKey?: string
      confirmed?: boolean
      usdReceivedCents?: number
      khrReceived?: number
      changeUsdCents?: number
      changeKhr?: number
      exchangeRateKhrPerUsd?: number
    }) => {
      const result = await apiRequest<SaleOrder>('/api/orders', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      await refresh()
      return result
    },
    [refresh],
  )

  const openShift = useCallback(
    (openingCash: number) =>
      apiRequest<ShiftResult>('/api/shifts/open', {
        method: 'POST',
        body: JSON.stringify({ openingCash }),
      }),
    [],
  )
  const closeShift = useCallback(
    (closingCash: number) =>
      apiRequest<ShiftResult>('/api/shifts/close', {
        method: 'POST',
        body: JSON.stringify({ closingCash }),
      }),
    [],
  )

  const value = useMemo(
    () => ({
      products,
      orders,
      categories: ['All', ...categoryNames],
      nextOrderNumber,
      loading,
      error,
      refresh,
      createProduct,
      createOrder,
      openShift,
      closeShift,
    }),
    [
      products,
      orders,
      categoryNames,
      nextOrderNumber,
      loading,
      error,
      refresh,
      createProduct,
      createOrder,
      openShift,
      closeShift,
    ],
  )
  return (
    <SaleDataContext.Provider value={value}>
      {children}
    </SaleDataContext.Provider>
  )
}

export function useSaleData() {
  const context = useContext(SaleDataContext)
  if (!context)
    throw new Error('useSaleData must be used within SaleDataProvider')
  return context
}
