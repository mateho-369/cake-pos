import { useState } from 'react'
import { motion } from 'framer-motion'
import { db } from '../lib/db'
import { parseMoney } from '../lib/money'
import Logo from './Logo'

export default function OpenShiftModal({ name }: { name: string }) {
  const [amount, setAmount] = useState('50.00')
  const [error, setError] = useState('')

  const open = () => {
    try {
      db.openShift(parseMoney(amount))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open shift.')
    }
  }

  return (
    <div className="app-shell grid place-items-center px-5">
      <motion.div
        className="glass-strong specular w-full max-w-md p-7"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      >
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Good to see you, {name.split(' ')[0]}</h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          Count the drawer, then open your shift. You can ring up cakes after this.
        </p>
        <label className="field-label mt-6">Opening cash (USD)</label>
        <input className="field tabular" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        {error && <p className="mt-3 text-sm" style={{ color: '#BE123C' }}>{error}</p>}
        <button type="button" className="btn-pink btn-pink-ring mt-5 w-full" onClick={open}>
          Open shift
        </button>
      </motion.div>
    </div>
  )
}
