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
import type {
  Category,
  Customer,
  Employee,
  Order,
  Product,
  ReportSummary,
  RevenuePoint,
} from '../data'

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
type CategoryInput = {
  name: string
  color?: string
  active?: boolean
  sortOrder?: number
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
  revenueData: RevenuePoint[]
  summary: ReportSummary | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createProduct: (input: ProductInput) => Promise<Product>
  updateProduct: (id: number, input: Partial<ProductInput>) => Promise<Product>
  createCategory: (input: CategoryInput) => Promise<Category>
  createEmployee: (input: EmployeeInput) => Promise<Employee>
  updateOrder: (
    id: string,
    input: { status?: Order['status']; total?: number },
  ) => Promise<Order>
  correctOrder: (
    id: string,
    input: { type: 'refund' | 'void'; amount?: number },
  ) => Promise<Order>
  customerOrders: (id: number) => Promise<Order[]>
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
  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token) {
      setProducts([])
      setOrders([])
      setCategories([])
      setEmployees([])
      setCustomers([])
      setSummary(null)
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
        nextSummary,
      ] = await Promise.all([
        apiRequest<Product[]>('/api/products'),
        apiRequest<Category[]>('/api/categories'),
        apiRequest<Order[]>('/api/orders'),
        apiRequest<Employee[]>('/api/employees'),
        apiRequest<Customer[]>('/api/customers'),
        apiRequest<ReportSummary>('/api/reports/summary'),
      ])
      setProducts(nextProducts)
      setCategories(nextCategories)
      setOrders(nextOrders)
      setEmployees(nextEmployees)
      setCustomers(nextCustomers)
      setSummary(nextSummary)
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
  const value = useMemo(
    () => ({
      products,
      orders,
      categories,
      employees,
      customers,
      revenueData: summary?.revenueData || emptySummary.revenueData,
      summary,
      loading,
      error,
      refresh,
      createProduct,
      updateProduct,
      createCategory,
      createEmployee,
      updateOrder,
      correctOrder,
      customerOrders,
    }),
    [
      products,
      orders,
      categories,
      employees,
      customers,
      summary,
      loading,
      error,
      refresh,
      createProduct,
      updateProduct,
      createCategory,
      createEmployee,
      updateOrder,
      correctOrder,
      customerOrders,
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
