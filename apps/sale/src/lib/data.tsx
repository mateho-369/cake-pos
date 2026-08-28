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
  images?: Product['images']
  active: boolean
}
type ProductInput = {
  name: string
  category: string
  /**
   * Real category row id. Preferred over the `category` name: it survives
   * renames and disambiguates same-named categories. Both are sent so older
   * API deployments that only understand the name still work.
   */
  categoryId?: number
  price: number
  stock: number
  madeAt?: string
  bestBefore?: string
  imagePosition?: string
  imageUrl?: string
  images?: Array<{ url: string; caption?: string; sortOrder?: number }>
  active?: boolean
}
type ShiftResult = {
  id: number
  openingCash: number
  openingCashKhr?: number
  expectedCash: number
  expectedCashKhr?: number
  cashSales?: number
  cashSalesKhr?: number
  closingCash?: number
  variance: number
  startedAt?: string
  openedAt?: string
  status: 'Open' | 'Closed'
  closedAt?: string
}

type SaleDataContextValue = {
  products: Product[]
  orders: SaleOrder[]
  categories: string[]
  /** Full category rows incl. parentId — chips group one level deep. */
  categoryList: SaleCategory[]
  nextOrderNumber: number
  defaultShelfLifeDays: number
  /** Admin-configured USD→KHR rate (Settings → Payments), default 4100. */
  exchangeRateKhrPerUsd: number
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
  currentShift: ShiftResult | null | undefined
  openShift: (openingCash: number, openingCashKhr?: number) => Promise<ShiftResult>
  closeShift: (closingCash: number, closingCashKhr?: number) => Promise<ShiftResult>
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
  const [categoryList, setCategoryList] = useState<SaleCategory[]>([])
  const [nextOrderNumber, setNextOrderNumber] = useState(1)
  const [defaultShelfLifeDays, setDefaultShelfLifeDays] = useState(3)
  const [exchangeRateKhrPerUsd, setExchangeRateKhrPerUsd] = useState(4100)
  const [currentShift, setCurrentShift] = useState<
    ShiftResult | null | undefined
  >(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token) {
      setProducts([])
      setOrders([])
      setCategoryNames([])
      setCategoryList([])
      setCurrentShift(undefined)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [apiProducts, apiCategories, apiOrders, apiShift, apiRules] =
        await Promise.all([
          apiRequest<ApiProduct[]>('/api/products'),
          apiRequest<SaleCategory[]>('/api/categories'),
          apiRequest<SaleOrder[]>('/api/orders'),
          apiRequest<ShiftResult | null>('/api/shifts/current'),
          apiRequest<{
            defaultShelfLifeDays?: number
            exchangeRateKhrPerUsd?: number
          }>('/api/settings/pos-rules'),
        ])
      setDefaultShelfLifeDays(apiRules.defaultShelfLifeDays ?? 3)
      setExchangeRateKhrPerUsd(apiRules.exchangeRateKhrPerUsd ?? 4100)
      const mappedProducts = apiProducts
        .filter((product) => product.active)
        .map(mapProduct)
      const productCategories = mappedProducts.map(
        (product) => product.category,
      )
      // Keep the full hierarchy (parentId) so the terminal can show
      // subcategories grouped under their parent, one level deep.
      setCategoryList(apiCategories)
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
      setCurrentShift(apiShift)
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
    async (openingCash: number, openingCashKhr = 0) => {
      const result = await apiRequest<ShiftResult>('/api/shifts/open', {
        method: 'POST',
        body: JSON.stringify({ openingCash, openingCashKhr }),
      })
      setCurrentShift(result)
      return result
    },
    [],
  )
  const closeShift = useCallback(
    async (closingCash: number, closingCashKhr = 0) => {
      const result = await apiRequest<ShiftResult>('/api/shifts/close', {
        method: 'POST',
        body: JSON.stringify({ closingCash, closingCashKhr }),
      })
      setCurrentShift(null)
      return result
    },
    [],
  )

  /**
   * Cheap shift-only revalidation, polled while the terminal is open: the
   * shift can be opened/closed from another device (admin app, another
   * till) and the header indicator must follow the server, not a stale
   * local snapshot.
   */
  const refreshShift = useCallback(async () => {
    if (!token) return
    try {
      const next = await apiRequest<ShiftResult | null>(
        '/api/shifts/current',
      )
      setCurrentShift((previous) =>
        previous?.id === next?.id &&
        (previous?.status ?? null) === (next?.status ?? null)
          ? previous
          : next,
      )
    } catch {
      // transient network error — the next poll retries
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    const interval = window.setInterval(() => void refreshShift(), 15_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshShift()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [token, refreshShift])

  const value = useMemo(
    () => ({
      products,
      orders,
      categories: ['All', ...categoryNames],
      categoryList,
      nextOrderNumber,
      defaultShelfLifeDays,
      exchangeRateKhrPerUsd,
      loading,
      error,
      refresh,
      createProduct,
      createOrder,
      currentShift,
      openShift,
      closeShift,
    }),
    [
      products,
      orders,
      categoryNames,
      categoryList,
      nextOrderNumber,
      defaultShelfLifeDays,
      exchangeRateKhrPerUsd,
      loading,
      error,
      refresh,
      createProduct,
      createOrder,
      currentShift,
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
