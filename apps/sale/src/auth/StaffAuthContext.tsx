import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { login, loginWithPin, logout, setAccessToken } from '../lib/api'

export type Employee = {
  id?: number
  name?: string
  email?: string
  role?: string
}

type StaffAuthContextValue = {
  token: string | null
  employee: Employee | null
  signIn: (email: string, password: string) => Promise<void>
  signInWithPin: (pin: string) => Promise<void>
  signOut: () => Promise<void>
}

const StaffAuthContext = createContext<StaffAuthContextValue | null>(null)
const AUTH_STORAGE_KEY = 'atelier.authToken'
const demoMode = import.meta.env.VITE_DEMO_MODE === 'true'

function readStoredToken() {
  try {
    const storedToken = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (storedToken) setAccessToken(storedToken)
    return storedToken
  } catch {
    return null
  }
}

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readStoredToken)
  const [employee, setEmployee] = useState<Employee | null>(null)

  const acceptAuth = (nextToken: string, nextEmployee: Employee) => {
    setAccessToken(nextToken)
    try {
      sessionStorage.setItem(AUTH_STORAGE_KEY, nextToken)
    } catch {
      /* Storage may be unavailable in a restricted webview. */
    }
    setToken(nextToken)
    setEmployee(nextEmployee)
  }

  const signIn = async (email: string, password: string) => {
    if (demoMode) {
      await new Promise((resolve) => window.setTimeout(resolve, 450))
      acceptAuth('demo-sale-bearer-token', {
        id: 2,
        name: 'Sophea Chan',
        email,
        role: 'cashier',
      })
      return
    }
    const result = await login(email, password)
    acceptAuth(result.token, result.employee as Employee)
  }

  const signInWithPin = async (pin: string) => {
    if (demoMode) {
      await new Promise((resolve) => window.setTimeout(resolve, 350))
      if (pin !== '1234') throw new Error('auth.incorrectPin')
      acceptAuth('demo-sale-bearer-token', {
        id: 2,
        name: 'Sophea Chan',
        role: 'cashier',
      })
      return
    }
    const result = await loginWithPin(pin)
    acceptAuth(result.token, result.employee as Employee)
  }

  const signOut = async () => {
    try {
      if (!demoMode) await logout()
      else setAccessToken(null)
    } finally {
      try {
        sessionStorage.removeItem(AUTH_STORAGE_KEY)
      } catch {
        /* Storage may be unavailable in a restricted webview. */
      }
      setToken(null)
      setEmployee(null)
    }
  }

  const value = useMemo(
    () => ({ token, employee, signIn, signInWithPin, signOut }),
    [token, employee],
  )
  return (
    <StaffAuthContext.Provider value={value}>
      {children}
    </StaffAuthContext.Provider>
  )
}

export function useStaffAuth() {
  const context = useContext(StaffAuthContext)
  if (!context)
    throw new Error('useStaffAuth must be used within StaffAuthProvider')
  return context
}
