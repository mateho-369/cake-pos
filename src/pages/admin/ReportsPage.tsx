import { useMemo, useState } from 'react'
import { useStore } from '../../contexts/StoreContext'
import { addDays, localISODate, money } from '../../lib/money'

export default function ReportsPage() {
  const { state } = useStore()
  const [from, setFrom] = useState(addDays(localISODate(), -6))
  const [to, setTo] = useState(localISODate())

  const rows = useMemo(() => {
    return state.orders.filter((o) => {
      const d = o.createdAt.slice(0, 10)
      return o.status === 'completed' && d >= from && d <= to
    })
  }, [state.orders, from, to])

  const total = rows.reduce((s, o) => s + o.total, 0)
  const cash = rows.filter((o) => o.paymentMethod === 'cash').reduce((s, o) => s + o.total, 0)
  const khqr = rows.filter((o) => o.paymentMethod === 'khqr').reduce((s, o) => s + o.total, 0)

  const byCashier = new Map<string, number>()
  for (const o of rows) byCashier.set(o.cashierName, (byCashier.get(o.cashierName) ?? 0) + o.total)

  return (
    <div className="bloom-in mx-auto max-w-4xl pb-10">
      <h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
        Filter by day. Laravel will later power this from MySQL.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <label className="text-sm">
          From
          <input className="field mt-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm">
          To
          <input className="field mt-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="glass stat">
          <p className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
            Total
          </p>
          <p className="stat-value mt-1">{money(total)}</p>
        </div>
        <div className="glass stat">
          <p className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
            Cash
          </p>
          <p className="stat-value mt-1">{money(cash)}</p>
        </div>
        <div className="glass stat">
          <p className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
            KHQR
          </p>
          <p className="stat-value mt-1">{money(khqr)}</p>
        </div>
      </div>
      <div className="glass mt-4 p-5">
        <h2 className="text-sm font-semibold">By cashier</h2>
        <ul className="mt-3 space-y-2">
          {[...byCashier.entries()].map(([name, amount]) => (
            <li key={name} className="flex justify-between text-sm">
              <span>{name}</span>
              <span className="tabular font-semibold">{money(amount)}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-sm" style={{ color: 'var(--ink-3)' }}>
        {rows.length} orders in range
      </p>
    </div>
  )
}
