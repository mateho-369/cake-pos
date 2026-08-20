import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { db } from '../lib/db'
import type { DbState, Employee, Shift } from '../types'

interface StoreValue {
  state: DbState
  me: Employee | null
  shift: Shift | null
}

const StoreContext = createContext<StoreValue>({ state: db.get(), me: null, shift: null })

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DbState>(() => db.get())

  useEffect(() => db.subscribe(() => setState({ ...db.get() })), [])

  const me = state.session ? state.employees.find((e) => e.id === state.session?.employeeId) ?? null : null
  const shift = me ? state.shifts.find((s) => s.cashierId === me.id && !s.closedAt) ?? null : null

  return <StoreContext.Provider value={{ state, me, shift }}>{children}</StoreContext.Provider>
}

export const useStore = () => useContext(StoreContext)
