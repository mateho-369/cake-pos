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
import { normalizeCurrentShift } from '@cake-pos/api-client'
import type {
  Category,
  Customer,
  Employee,
  FreshnessReport,
  Order,
  Product,
  ReportSummary,
  RevenuePoint,
  Shift,
} from '../data'

type ProductInput = {
  name: string
  // Preferred: the stable category id (rename-safe, no duplicate-name
  // collisions). The name string is still accepted by the API for older
  // callers, but the admin app always sends categoryId.
  categoryId?: number
  category?: string
  price: number
  stock: number
  madeAt?: string
  bestBefore?: string
  imagePosition?: string
  imageUrl?: string
  images?: Array<{ url: string; caption?: string; sortOrder?: number }>
  active?: boolean
  hideWhenOutOfStock?: boolean
  // Required by the API when this update deactivates the product or zeroes
  // its stock — recorded in the accountability audit trail.
  reasonCode?: string
  reasonNote?: string
}
type CategoryInput = {
  name: string
  color?: string
  active?: boolean
  sortOrder?: number
  parentCategoryId?: number | null
}
type EmployeeInput = {
  name: string
  email?: string
  role?: string
  password?: string
  pin_code?: string
  active?: boolean
}

type AdminDataContextValue = {
  products: Product[]
  orders: Order[]
  categories: Category[]
  employees: Employee[]
  customers: Customer[]
  shifts: Shift[]
  currentShift: Shift | null
  revenueData: RevenuePoint[]
  summary: ReportSummary | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  /** Re-fetch only /api/shifts/current (polled; keeps status indicators live). */
  refreshShift: () => Promise<void>
  loadDashboard: (
    preset: 'today' | 'seven_days' | 'thirty_days',
  ) => Promise<void>
  createProduct: (input: ProductInput) => Promise<Product>
  updateProduct: (id: number, input: Partial<ProductInput>) => Promise<Product>
  deleteProduct: (id: number) => Promise<void>
  createCategory: (input: CategoryInput) => Promise<Category>
  updateCategory: (
    id: number,
    input: Partial<CategoryInput>,
  ) => Promise<Category>
  /** Owner review of a cashier-proposed category: approve or reject. */
  reviewCategory: (
    id: number,
    action: 'approve' | 'reject',
  ) => Promise<Category>
  createEmployee: (input: EmployeeInput) => Promise<Employee>
  updateEmployee: (
    id: number,
    input: Partial<EmployeeInput>,
  ) => Promise<Employee>
  deactivateEmployee: (id: number) => Promise<void>
  updateOrder: (
    id: string,
    input: { status?: Order['status']; total?: number },
  ) => Promise<Order>
  correctOrder: (
    id: string,
    input: { type: 'refund' | 'void'; amount?: number },
  ) => Promise<Order>
  customerOrders: (id: number) => Promise<Order[]>
  freshness: FreshnessReport | null
  defaultShelfLifeDays: number
  recordWaste: (input: {
    productId: number
    quantity: number
    reason: string
    note?: string
  }) => Promise<void>
}

const AdminDataContext = createContext<AdminDataContextValue | null>(null)
const emptySummary: ReportSummary = {
  todaySalesTotal: 0,
  todayOrdersCount: 0,
  revenueData: [],
  topProducts: [],
}

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const { token } = useStaffAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [currentShift, setCurrentShift] = useState<Shift | null>(null)
  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [freshness, setFreshness] = useState<FreshnessReport | null>(null)
  const [defaultShelfLifeDays, setDefaultShelfLifeDays] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token) {
      setProducts([])
      setOrders([])
      setCategories([])
      setEmployees([])
      setCustomers([])
      setShifts([])
      setCurrentShift(null)
      setSummary(null)
      setFreshness(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [
        nextProducts,
        nextCategories,
        nextOrders,
        nextEmployees,
        nextCustomers,
        nextShifts,
        nextCurrentShift,
        nextSummary,
        nextFreshness,
        nextRules,
      ] = await Promise.all([
        apiRequest<Product[]>('/api/products'),
        apiRequest<Category[]>('/api/categories'),
        apiRequest<Order[]>('/api/orders'),
        apiRequest<Employee[]>('/api/employees'),
        apiRequest<Customer[]>('/api/customers'),
        apiRequest<Shift[]>('/api/shifts'),
        apiRequest<Shift | null>('/api/shifts/current').then(
          normalizeCurrentShift,
        ),
        apiRequest<ReportSummary>('/api/reports/summary'),
        apiRequest<FreshnessReport>('/api/reports/freshness'),
        apiRequest<{ defaultShelfLifeDays?: number }>(
          '/api/settings/pos-rules',
        ),
      ])
      setProducts(nextProducts)
      setCategories(nextCategories)
      setOrders(nextOrders)
      setEmployees(nextEmployees)
      setCustomers(nextCustomers)
      setShifts(nextShifts)
      setCurrentShift(nextCurrentShift)
      setSummary(nextSummary)
      setFreshness(nextFreshness)
      setDefaultShelfLifeDays(nextRules.defaultShelfLifeDays ?? 3)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to load admin data',
      )
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * Lightweight shift-only revalidation. The shift badge/panels must reflect
   * the SERVER's truth, which can change from another terminal (sale app,
   * another admin tab) at any moment. Full `refresh()` covers mutations made
   * in THIS tab; this cheap endpoint is polled every 20s and whenever the tab
   * regains focus so the indicator can never sit on a stale "Open".
   */
  const refreshShift = useCallback(async () => {
    if (!token) return
    try {
      const next = normalizeCurrentShift(
        await apiRequest<Shift | null>('/api/shifts/current'),
      )
      setCurrentShift((previous) =>
        // Keep referential stability when nothing changed so components
        // don't needlessly re-render (and effects don't re-run).
        previous?.id === next?.id &&
        (previous?.status ?? null) === (next?.status ?? null)
          ? previous
          : next,
      )
    } catch {
      // Network hiccup: keep the last known state; the next poll retries.
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    const interval = window.setInterval(() => void refreshShift(), 20_000)
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

  const loadDashboard = useCallback(
    async (preset: 'today' | 'seven_days' | 'thirty_days') => {
      if (!token) return
      const apiPreset =
        preset === 'seven_days'
          ? 'this_week'
          : preset === 'thirty_days'
            ? 'this_month'
            : 'today'
      const nextSummary = await apiRequest<ReportSummary>(
        `/api/reports/summary?preset=${apiPreset}`,
      )
      setSummary(nextSummary)
    },
    [token],
  )

  const createProduct = useCallback(
    async (input: ProductInput) => {
      const result = await apiRequest<Product>('/api/products', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      await refresh()
      return result
    },
    [refresh],
  )

  const updateProduct = useCallback(
    async (id: number, input: Partial<ProductInput>) => {
      const result = await apiRequest<Product>(`/api/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      })
      await refresh()
      return result
    },
    [refresh],
  )

  const deleteProduct = useCallback(
    async (id: number) => {
      try {
        await apiRequest(`/api/products/${id}`, {
          method: 'DELETE',
        })
      } catch (reason) {
        // The backend returns a 422 with a structured JSON body when the
        // product is referenced by past orders. Re-throw that message so the
        // UI can show a clear explanation instead of a generic failure.
        if (reason instanceof Error) {
          throw reason
        }
        throw new Error(reason?.toString?.() ?? 'Delete failed')
      }
      await refresh()
    },
    [refresh],
  )

  const createCategory = useCallback(
    async (input: CategoryInput) => {
      const result = await apiRequest<Category>('/api/categories', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      await refresh()
      return result
    },
    [refresh],
  )

  const createEmployee = useCallback(
    async (input: EmployeeInput) => {
      const result = await apiRequest<Employee>('/api/employees', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      await refresh()
      return result
    },
    [refresh],
  )

  const updateEmployee = useCallback(
    async (id: number, input: Partial<EmployeeInput>) => {
      const result = await apiRequest<Employee>(`/api/employees/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      })
      await refresh()
      return result
    },
    [refresh],
  )

  const deactivateEmployee = useCallback(
    async (id: number) => {
      await apiRequest(`/api/employees/${id}`, { method: 'DELETE' })
      await refresh()
    },
    [refresh],
  )

  const updateCategory = useCallback(
    async (id: number, input: Partial<CategoryInput>) => {
      const result = await apiRequest<Category>(`/api/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      })
      await refresh()
      return result
    },
    [refresh],
  )

  const reviewCategory = useCallback(
    async (id: number, action: 'approve' | 'reject') => {
      const result = await apiRequest<Category>(
        `/api/categories/${id}/review`,
        { method: 'POST', body: JSON.stringify({ action }) },
      )
      await refresh()
      return result
    },
    [refresh],
  )

  const updateOrder = useCallback(
    async (id: string, input: { status?: Order['status']; total?: number }) => {
      const result = await apiRequest<Order>(`/api/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
      await refresh()
      return result
    },
    [refresh],
  )
  const correctOrder = useCallback(
    async (id: string, input: { type: 'refund' | 'void'; amount?: number }) => {
      const result = await apiRequest<Order>(`/api/orders/${id}/corrections`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
      await refresh()
      return result
    },
    [refresh],
  )
  const customerOrders = useCallback(
    (id: number) => apiRequest<Order[]>(`/api/customers/${id}/orders`),
    [],
  )
  const recordWaste = useCallback(
    async (input: {
      productId: number
      quantity: number
      reason: string
      note?: string
    }) => {
      await apiRequest('/api/inventory/waste', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      await refresh()
    },
    [refresh],
  )
  const value = useMemo(
    () => ({
      products,
      orders,
      categories,
      employees,
      customers,
      shifts,
      currentShift,
      revenueData: summary?.revenueData || emptySummary.revenueData,
      summary,
      freshness,
      defaultShelfLifeDays,
      loading,
      error,
      refresh,
      refreshShift,
      loadDashboard,
      createProduct,
      updateProduct,
      deleteProduct,
      createCategory,
      updateCategory,
      reviewCategory,
      createEmployee,
      updateEmployee,
      deactivateEmployee,
      updateOrder,
      correctOrder,
      customerOrders,
      recordWaste,
    }),
    [
      products,
      orders,
      categories,
      employees,
      customers,
      shifts,
      currentShift,
      summary,
      freshness,
      defaultShelfLifeDays,
      loading,
      error,
      refresh,
      refreshShift,
      loadDashboard,
      createProduct,
      updateProduct,
      deleteProduct,
      createCategory,
      updateCategory,
      reviewCategory,
      createEmployee,
      updateEmployee,
      deactivateEmployee,
      updateOrder,
      correctOrder,
      customerOrders,
      recordWaste,
    ],
  )
  return (
    <AdminDataContext.Provider value={value}>
      {children}
    </AdminDataContext.Provider>
  )
}

export function useAdminData() {
  const context = useContext(AdminDataContext)
  if (!context)
    throw new Error('useAdminData must be used within AdminDataProvider')
  return context
}
