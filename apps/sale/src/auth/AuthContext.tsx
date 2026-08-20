import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { login, loginWithPin, logout, setAccessToken } from '../lib/api'

export type Employee = {
  id?: number
  name?: string
  email?: string
  role?: string
}

type AuthContextValue = {
  token: string | null
  employee: Employee | null
  signIn: (email: string, password: string) => Promise<void>
  signInWithPin: (pin: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const demoMode = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)

  const acceptAuth = (nextToken: string, nextEmployee: Employee) => {
    setAccessToken(nextToken)
    setToken(nextToken)
    setEmployee(nextEmployee)
  }

  const signIn = async (email: string, password: string) => {
    if (demoMode) {
      await new Promise((resolve) => window.setTimeout(resolve, 450))
      acceptAuth('demo-sale-bearer-token', { id: 2, name: 'Sophea Chan', email, role: 'cashier' })
      return
    }
    const result = await login(email, password)
    acceptAuth(result.token, result.employee as Employee)
  }

  const signInWithPin = async (pin: string) => {
    if (demoMode) {
      await new Promise((resolve) => window.setTimeout(resolve, 350))
      if (pin !== '1234') throw new Error('Incorrect PIN. Use 1234 for this demo.')
      acceptAuth('demo-sale-bearer-token', { id: 2, name: 'Sophea Chan', role: 'cashier' })
      return
    }
    const result = await loginWithPin(pin)
    acceptAuth(result.token, result.employee as Employee)
  }

  const signOut = () => {
    logout()
    setToken(null)
    setEmployee(null)
  }

  const value = useMemo(() => ({ token, employee, signIn, signInWithPin, signOut }), [token, employee])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
