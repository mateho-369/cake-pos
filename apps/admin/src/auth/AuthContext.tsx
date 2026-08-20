import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { login, logout, setAccessToken } from '../lib/api'

type Employee = {
  id?: number
  name?: string
  email?: string
  role?: string
}

type AuthContextValue = {
  token: string | null
  employee: Employee | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)

  const signIn = async (email: string, password: string) => {
    const result = await login(email, password)
    setToken(result.token)
    setEmployee(result.employee as Employee)
  }

  const signOut = () => {
    logout()
    setToken(null)
    setEmployee(null)
  }

  const value = useMemo(() => ({ token, employee, signIn, signOut }), [token, employee])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

export function setDemoAccessToken(token: string | null) {
  setAccessToken(token)
}
