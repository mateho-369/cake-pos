import { useEffect, useState } from 'react'
import { AlertTriangle, Clock3, ShoppingBag, TrendingDown, TrendingUp } from 'lucide-react'
import { api, duration, formatDay, money, type DashboardStats } from '@bloom/shared'

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.reports.dashboard().then(setStats).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed'))
  }, [])

  if (error) return <p className="p-6" style={{ color: '#BE123C' }}>{error}</p>
  if (!stats) return <p className="p-6" style={{ color: 'var(--ink-3)' }}>Loading…</p>

  const delta = stats.yesterdaySales === 0 ? 100 : Math.round(((stats.todaySales - stats.yesterdaySales) / stats.yesterdaySales) * 100)
  const up = delta >= 0
  const max = Math.max(...stats.revenue7d.map((d) => d.total), 1)
  const w = 560
  const h = 180
  const pts = stats.revenue7d.map((d, i) => {
    const x = (i / (stats.revenue7d.length - 1)) * (w - 24) + 12
    const y = h - 28 - (d.total / max) * (h - 48)
    return `${x},${y}`
  })
  const area = `12,${h - 28} ${pts.join(' ')} ${w - 12},${h - 28}`

  return (
    <div className="bloom-in mx-auto max-w-6xl pb-10">
      <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--pink-deep)' }}>
        Bloom
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Good morning</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
        Five-minute check-in. Sell the cakes that are closest to best-before first.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass stat">
          <p className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
            Today's sales
          </p>
          <p className="stat-value mt-2">{money(stats.todaySales)}</p>
          <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium" style={{ color: up ? '#047857' : '#BE123C' }}>
            {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {up ? '+' : ''}
            {delta}% vs yesterday
          </p>
        </div>
        <div className="glass stat">
          <p className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
            Orders today
          </p>
          <p className="stat-value mt-2">{stats.ordersToday}</p>
          <p className="mt-2 inline-flex items-center gap-1 text-xs" style={{ color: 'var(--ink-3)' }}>
            <ShoppingBag size={14} /> tickets
          </p>
        </div>
        <div className="glass stat" style={{ boxShadow: '0 0 0 1.5px rgba(251,113,133,0.45), var(--shadow-md)' }}>
          <p className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: '#BE123C' }}>
            Near best-before
          </p>
          <p className="stat-value mt-2" style={{ color: '#BE123C' }}>
            {stats.nearExpiry}
          </p>
          <p className="mt-2 inline-flex items-center gap-1 text-xs" style={{ color: '#BE123C' }}>
            <AlertTriangle size={14} /> sell these first
          </p>
        </div>
        <div className="glass stat">
          <p className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
            Active shift
          </p>
          <p className="mt-2 text-xl font-semibold tracking-tight">{stats.activeShift ? stats.activeShift.cashierName : 'None'}</p>
          <p className="mt-2 inline-flex items-center gap-1 text-xs" style={{ color: 'var(--ink-3)' }}>
            <Clock3 size={14} /> {stats.activeShift ? duration(stats.activeShift.openedAt) : 'No drawer open'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="glass p-5">
          <h2 className="text-sm font-semibold">7-day revenue</h2>
          <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full">
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#F472B6" stopOpacity="0.45" />
                <stop offset="1" stopColor="#F472B6" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={area} fill="url(#rev)" />
            <polyline points={pts.join(' ')} fill="none" stroke="#3B82F6" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            {stats.revenue7d.map((d, i) => {
              const x = (i / (stats.revenue7d.length - 1)) * (w - 24) + 12
              return (
                <text key={d.date} x={x} y={h - 8} textAnchor="middle" fontSize="11" fill="rgba(59,10,31,0.45)">
                  {formatDay(d.date).split(' ')[0]}
                </text>
              )
            })}
          </svg>
        </div>
        <div className="glass p-5">
          <h2 className="text-sm font-semibold">Top cakes</h2>
          <ul className="mt-4 space-y-3">
            {stats.topCakes.map((row) => {
              const width = (row.qty / (stats.topCakes[0]?.qty || 1)) * 100
              return (
                <li key={row.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{row.name}</span>
                    <span className="tabular" style={{ color: 'var(--ink-3)' }}>
                      {row.qty}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.5)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${width}%`, background: 'linear-gradient(90deg, #F472B6, #3B82F6)' }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
