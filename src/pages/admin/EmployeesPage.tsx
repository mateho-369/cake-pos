import { useState, type FormEvent } from 'react'
import { useStore } from '../../contexts/StoreContext'
import { db } from '../../lib/db'
import type { Role } from '../../types'

export default function EmployeesPage() {
  const { state } = useStore()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '', pinCode: '', role: 'cashier' as Role })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      if (!/^\d{4}$/.test(form.pinCode)) throw new Error('PIN must be 4 digits.')
      db.createEmployee(form)
      setOpen(false)
      setForm({ name: '', email: '', password: '', pinCode: '', role: 'cashier' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create employee.')
    }
  }

  return (
    <div className="bloom-in mx-auto max-w-5xl pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Employees</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
            You create every account. There is no public signup.
          </p>
        </div>
        <button type="button" className="btn-pink" onClick={() => setOpen(true)}>
          Add employee
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {state.employees.map((e) => (
          <article key={e.id} className="glass p-4">
            <div className="flex items-center gap-3">
              <span
                className="grid h-12 w-12 place-items-center rounded-full text-lg font-semibold text-white"
                style={{ background: 'linear-gradient(180deg, #F9A8D4, #F472B6)' }}
              >
                {e.name.slice(0, 1)}
              </span>
              <div>
                <p className="font-semibold">{e.name}</p>
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  {e.email}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className={`badge ${e.role === 'admin' ? 'badge-coral' : 'badge-fresh'}`}>{e.role}</span>
              <label className="flex items-center gap-2 text-sm">
                <span style={{ color: 'var(--ink-3)' }}>{e.active ? 'Active' : 'Paused'}</span>
                <input
                  type="checkbox"
                  className="accent-[#F472B6]"
                  checked={e.active}
                  onChange={(ev) => db.updateEmployee(e.id, { active: ev.target.checked })}
                />
              </label>
            </div>
            {e.pinCode && (
              <p className="mt-3 text-xs tabular" style={{ color: 'var(--ink-4)' }}>
                PIN · {e.pinCode}
              </p>
            )}
          </article>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-40 grid place-items-center px-4" style={{ background: 'rgba(59,10,31,0.28)' }} onClick={() => setOpen(false)}>
          <form className="sheet w-full max-w-md rounded-[24px] p-5" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h2 className="text-lg font-semibold">New employee</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--ink-3)' }}>
              Admin-created only.
            </p>
            <label className="field-label mt-4">Name</label>
            <input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label className="field-label mt-3">Email</label>
            <input className="field" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <label className="field-label mt-3">Password</label>
            <input className="field" type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <label className="field-label mt-3">4-digit PIN</label>
            <input className="field tabular" inputMode="numeric" maxLength={4} required value={form.pinCode} onChange={(e) => setForm({ ...form, pinCode: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
            <label className="field-label mt-3">Role</label>
            <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="cashier">Cashier</option>
              <option value="admin">Admin</option>
            </select>
            {error && <p className="mt-3 text-sm" style={{ color: '#BE123C' }}>{error}</p>}
            <button className="btn-pink mt-4 w-full" type="submit">
              Create account
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
