import { useEffect, useState } from 'react'
import { api, duration, formatDateTime, money, parseMoney, type Shift } from '@bloom/shared'

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [current, setCurrent] = useState<Shift | null>(null)
  const [closing, setClosing] = useState('50.00')

  const reload = async () => {
    const [list, cur] = await Promise.all([api.shifts.list(), api.shifts.current()])
    setShifts(list)
    setCurrent(cur.shift)
  }

  useEffect(() => {
    void reload()
  }, [])

  return (
    <div className="bloom-in mx-auto max-w-4xl pb-10">
      <h1 className="text-3xl font-semibold tracking-tight">Shifts</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
        Opening cash, expected drawer, variance.
      </p>

      {current && (
        <div className="glass mt-6 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--pink-deep)' }}>
            Open now
          </p>
          <p className="mt-1 text-xl font-semibold">
            {current.cashierName} · {duration(current.openedAt)}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
            Opening {money(current.openingCash)} · cash sales {money(current.cashSales)} · expected{' '}
            {money(current.openingCash + current.cashSales)}
          </p>
          <div className="mt-4 flex gap-2">
            <input className="field" value={closing} onChange={(e) => setClosing(e.target.value)} />
            <button
              type="button"
              className="btn-deep shrink-0"
              onClick={() => void api.shifts.close(parseMoney(closing)).then(reload)}
            >
              Close shift
            </button>
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {shifts.map((s) => (
          <li key={s.id} className="glass flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div>
              <p className="font-semibold">{s.cashierName}</p>
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                {formatDateTime(s.openedAt)}
                {s.closedAt ? ` → ${formatDateTime(s.closedAt)}` : ' · open'}
              </p>
            </div>
            <div className="text-right text-sm tabular">
              <p>Open {money(s.openingCash)}</p>
              {s.closedAt && (
                <p style={{ color: (s.variance ?? 0) === 0 ? '#047857' : '#BE123C' }}>
                  Variance {money(s.variance ?? 0)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
