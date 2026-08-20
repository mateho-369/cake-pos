import { useState } from 'react'
import { useStore } from '../../contexts/StoreContext'
import { db } from '../../lib/db'
import { duration, formatDateTime, money, parseMoney } from '../../lib/money'

export default function ShiftsPage() {
  const { state, shift } = useStore()
  const [closing, setClosing] = useState('50.00')

  return (
    <div className="bloom-in mx-auto max-w-4xl pb-10">
      <h1 className="text-3xl font-semibold tracking-tight">Shifts</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
        Opening cash, expected drawer, variance.
      </p>

      {shift && (
        <div className="glass mt-6 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--pink-deep)' }}>
            Open now
          </p>
          <p className="mt-1 text-xl font-semibold">
            {shift.cashierName} · {duration(shift.openedAt)}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
            Opening {money(shift.openingCash)} · cash sales {money(shift.cashSales)} · expected{' '}
            {money(shift.openingCash + shift.cashSales)}
          </p>
          <div className="mt-4 flex gap-2">
            <input className="field" value={closing} onChange={(e) => setClosing(e.target.value)} />
            <button type="button" className="btn-deep shrink-0" onClick={() => db.closeShift(parseMoney(closing))}>
              Close shift
            </button>
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {state.shifts.map((s) => (
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
