import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiRequest } from './api'
import type { Category, Employee, Order, Product, ReportSummary, RevenuePoint } from '../data'

type ProductInput = { name: string; category: string; price: number; stock: number; madeAt?: string; bestBefore?: string; imagePosition?: string; active?: boolean }
type CategoryInput = { name: string; color?: string; active?: boolean; sortOrder?: number }
type EmployeeInput = { name: string; email?: string; role?: string; password?: string; pin_code?: string; active?: boolean }

type AdminDataContextValue = {
  products: Product[]
  orders: Order[]
  categories: Category[]
  employees: Employee[]
  revenueData: RevenuePoint[]
  summary: ReportSummary | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createProduct: (input: ProductInput) => Promise<Product>
  updateProduct: (id: number, input: Partial<ProductInput>) => Promise<Product>
  createCategory: (input: CategoryInput) => Promise<Category>
  createEmployee: (input: EmployeeInput) => Promise<Employee>
}

const AdminDataContext = createContext<AdminDataContextValue | null>(null)
const emptySummary: ReportSummary = { todaySalesTotal: 0, todayOrdersCount: 0, revenueData: [], topProducts: [] }

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token) {
      setProducts([]); setOrders([]); setCategories([]); setEmployees([]); setSummary(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [nextProducts, nextCategories, nextOrders, nextEmployees, nextSummary] = await Promise.all([
        apiRequest<Product[]>('/api/products'),
        apiRequest<Category[]>('/api/categories'),
        apiRequest<Order[]>('/api/orders'),
        apiRequest<Employee[]>('/api/employees'),
        apiRequest<ReportSummary>('/api/reports/summary'),
      ])
      setProducts(nextProducts); setCategories(nextCategories); setOrders(nextOrders); setEmployees(nextEmployees); setSummary(nextSummary)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load admin data')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { void refresh() }, [refresh])

  const createProduct = useCallback(async (input: ProductInput) => {
    const result = await apiRequest<Product>('/api/products', { method: 'POST', body: JSON.stringify(input) })
    await refresh()
    return result
  }, [refresh])

  const updateProduct = useCallback(async (id: number, input: Partial<ProductInput>) => {
    const result = await apiRequest<Product>(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(input) })
    await refresh()
    return result
  }, [refresh])

  const createCategory = useCallback(async (input: CategoryInput) => {
    const result = await apiRequest<Category>('/api/categories', { method: 'POST', body: JSON.stringify(input) })
    await refresh()
    return result
  }, [refresh])

  const createEmployee = useCallback(async (input: EmployeeInput) => {
    const result = await apiRequest<Employee>('/api/employees', { method: 'POST', body: JSON.stringify(input) })
    await refresh()
    return result
  }, [refresh])

  const value = useMemo(() => ({ products, orders, categories, employees, revenueData: summary?.revenueData || emptySummary.revenueData, summary, loading, error, refresh, createProduct, updateProduct, createCategory, createEmployee }), [products, orders, categories, employees, summary, loading, error, refresh, createProduct, updateProduct, createCategory, createEmployee])
  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>
}

export function useAdminData() {
  const context = useContext(AdminDataContext)
  if (!context) throw new Error('useAdminData must be used within AdminDataProvider')
  return context
}
