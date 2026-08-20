import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { api, setBearer, type AuthUser } from '../lib/api'

interface AuthValue {
  user: AuthUser | null
  token: string | null
  loginPin: (pin: string) => Promise<AuthUser>
  loginEmail: (email: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)

  const apply = (nextToken: string, nextUser: AuthUser) => {
    setBearer(nextToken)
    setToken(nextToken)
    setUser(nextUser)
  }

  const clear = () => {
    setBearer(null)
    setToken(null)
    setUser(null)
  }

  const value = useMemo<AuthValue>(
    () => ({
      user,
      token,
      loginPin: async (pin: string) => {
        const data = await api.auth.loginPin(pin)
        apply(data.token, data.user)
        return data.user
      },
      loginEmail: async (email: string, password: string) => {
        const data = await api.auth.loginEmail(email, password)
        apply(data.token, data.user)
        return data.user
      },
      logout: async () => {
        try {
          if (token) await api.auth.logout()
        } finally {
          clear()
        }
      },
    }),
    [user, token],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
