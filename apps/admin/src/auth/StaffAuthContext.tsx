import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { login, logout, setAccessToken } from '../lib/api'

type Employee = {
  id?: number
  name?: string
  email?: string
  role?: string
}

type StaffAuthContextValue = {
  token: string | null
  employee: Employee | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const StaffAuthContext = createContext<StaffAuthContextValue | null>(null)
const AUTH_STORAGE_KEY = 'atelier.authToken'
const EMPLOYEE_STORAGE_KEY = 'atelier.employee'

function readStoredToken() {
  try {
    const storedToken = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (storedToken) setAccessToken(storedToken)
    return storedToken
  } catch {
    return null
  }
}

function readStoredEmployee(): Employee | null {
  try {
    const raw = sessionStorage.getItem(EMPLOYEE_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Employee) : null
  } catch {
    return null
  }
}

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readStoredToken)
  const [employee, setEmployee] = useState<Employee | null>(readStoredEmployee)

  const signIn = async (email: string, password: string) => {
    const result = await login(email, password)
    setAccessToken(result.token)
    const nextEmployee = result.employee as Employee
    try {
      sessionStorage.setItem(AUTH_STORAGE_KEY, result.token)
      sessionStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(nextEmployee))
    } catch {
      /* Storage may be unavailable in a restricted webview. */
    }
    setToken(result.token)
    setEmployee(nextEmployee)
  }

  const signOut = async () => {
    try {
      await logout()
    } finally {
      try {
        sessionStorage.removeItem(AUTH_STORAGE_KEY)
        sessionStorage.removeItem(EMPLOYEE_STORAGE_KEY)
      } catch {
        /* Storage may be unavailable in a restricted webview. */
      }
      setToken(null)
      setEmployee(null)
    }
  }

  const value = useMemo(
    () => ({ token, employee, signIn, signOut }),
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

export function setDemoAccessToken(token: string | null) {
  setAccessToken(token)
}
