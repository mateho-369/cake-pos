import { useState } from 'react'
import { useStore } from '../../contexts/StoreContext'
import { db } from '../../lib/db'

export default function SettingsPage() {
  const { state } = useStore()
  const [form, setForm] = useState(state.settings)
  const [saved, setSaved] = useState(false)

  const save = () => {
    db.updateSettings({
      ...form,
      bestBeforeDays: form.bestBeforeDays === 3 ? 3 : 2,
    })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1600)
  }

  return (
    <div className="bloom-in mx-auto max-w-xl pb-10">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
        Shop identity and the static KHQR the cashier shows at payment.
      </p>
      <div className="glass mt-6 space-y-3 p-5">
        <div>
          <label className="field-label">Business name</label>
          <input className="field" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
        </div>
        <div>
          <label className="field-label">Address</label>
          <input className="field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <label className="field-label">KHQR merchant name</label>
          <input className="field" value={form.khqrMerchantName} onChange={(e) => setForm({ ...form, khqrMerchantName: e.target.value })} />
        </div>
        <div>
          <label className="field-label">KHQR note</label>
          <input className="field" value={form.khqrAccount} onChange={(e) => setForm({ ...form, khqrAccount: e.target.value })} />
        </div>
        <div>
          <label className="field-label">Best-before window</label>
          <select
            className="field"
            value={form.bestBeforeDays}
            onChange={(e) => setForm({ ...form, bestBeforeDays: Number(e.target.value) === 3 ? 3 : 2 })}
          >
            <option value={2}>2 days</option>
            <option value={3}>3 days</option>
          </select>
        </div>
        <button type="button" className="btn-pink w-full" onClick={save}>
          {saved ? 'Saved' : 'Save settings'}
        </button>
        <button
          type="button"
          className="btn-glass w-full"
          onClick={() => {
            if (window.confirm('Reset demo data? Open tickets and custom cakes will be cleared.')) db.resetDemo()
          }}
        >
          Reset demo data
        </button>
      </div>
    </div>
  )
}
