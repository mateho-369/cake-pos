import type {
  CartLine,
  Category,
  DashboardStats,
  Employee,
  Order,
  PaymentMethod,
  Product,
  Role,
  Settings,
  Shift,
} from '../types'

/**
 * API origin comes from the build-time env var. Production:
 *   VITE_API_URL=https://api.yourdomain.com/api
 * Local / Arena preview: leave unset so requests stay on `/api` and the
 * Vite dev server proxies them to the mock API (the user's browser is not
 * on localhost, so we never hardcode 127.0.0.1).
 */
export const apiBase = String(import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')

export type AuthUser = Omit<Employee, 'password'>

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

let bearer: string | null = null
const tokenListeners = new Set<(token: string | null) => void>()

export function getBearer() {
  return bearer
}

export function setBearer(token: string | null) {
  bearer = token
  tokenListeners.forEach((fn) => fn(token))
}

export function onBearerChange(fn: (token: string | null) => void) {
  tokenListeners.add(fn)
  return () => tokenListeners.delete(fn)
}

interface RequestOptions {
  method?: string
  body?: unknown
  auth?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers()
  headers.set('Accept', 'application/json')
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (options.auth !== false && bearer) headers.set('Authorization', `Bearer ${bearer}`)

  const response = await fetch(`${apiBase}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (response.status === 204) return undefined as T
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>

  if (!response.ok) {
    if (response.status === 401) setBearer(null)
    const message =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      'Request failed.'
    throw new ApiError(message, response.status)
  }
  return data as T
}

export const api = {
  auth: {
    loginEmail: (email: string, password: string) =>
      request<{ token: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      }),
    loginPin: (pin: string) =>
      request<{ token: string; user: AuthUser }>('/auth/login-pin', {
        method: 'POST',
        body: { pin },
        auth: false,
      }),
    me: () => request<{ user: AuthUser }>('/auth/me'),
    logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  },
  products: {
    list: () => request<Product[]>('/products'),
    create: (input: {
      name: string
      price: number
      categoryId: string
      imageUrl: string
      madeToday: boolean
      stockQty: number
    }) => request<Product>('/products', { method: 'POST', body: input }),
    update: (id: string, patch: Partial<Product>) =>
      request<Product>(`/products/${id}`, { method: 'PUT', body: patch }),
    remove: (id: string) => request<void>(`/products/${id}`, { method: 'DELETE' }),
  },
  categories: {
    list: () => request<Category[]>('/categories'),
    create: (name: string) => request<Category>('/categories', { method: 'POST', body: { name } }),
    remove: (id: string) => request<void>(`/categories/${id}`, { method: 'DELETE' }),
  },
  orders: {
    list: () => request<Order[]>('/orders'),
    create: (input: { items: CartLine[]; paymentMethod: PaymentMethod; cashTendered?: number }) =>
      request<Order>('/orders', { method: 'POST', body: input }),
  },
  shifts: {
    current: () => request<{ shift: Shift | null }>('/shifts/current'),
    list: () => request<Shift[]>('/shifts'),
    open: (openingCash: number) => request<Shift>('/shifts/open', { method: 'POST', body: { openingCash } }),
    close: (closingCash: number) => request<Shift>('/shifts/close', { method: 'POST', body: { closingCash } }),
  },
  employees: {
    list: () => request<AuthUser[]>('/employees'),
    create: (input: { name: string; email: string; password: string; pinCode: string; role: Role }) =>
      request<AuthUser>('/employees', { method: 'POST', body: input }),
    update: (id: string, patch: Partial<AuthUser>) =>
      request<AuthUser>(`/employees/${id}`, { method: 'PATCH', body: patch }),
  },
  settings: {
    get: () => request<Settings>('/settings'),
    update: (patch: Partial<Settings>) => request<Settings>('/settings', { method: 'PUT', body: patch }),
  },
  reports: {
    dashboard: () => request<DashboardStats>('/reports/dashboard'),
    range: (from: string, to: string) =>
      request<{ orders: Order[]; total: number; cash: number; khqr: number }>(
        `/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  },
}

export async function uploadWithTimeout(file: File, ms = 45_000): Promise<string> {
  if (file.size > 4 * 1024 * 1024) throw new Error('Please choose a photo smaller than 4 MB.')
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), ms)
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('The photo could not be read.'))
      reader.onabort = () => reject(new Error('The upload timed out.'))
      reader.readAsDataURL(file)
    })
    return dataUrl
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The upload timed out. Check the product list before retrying.')
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}
