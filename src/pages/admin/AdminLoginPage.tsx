import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Logo from '../../components/Logo'
import Horizon from '../../components/Horizon'
import { db } from '../../lib/db'
import { useStore } from '../../contexts/StoreContext'
import { DEMO } from '../../lib/seed'

export default function AdminLoginPage() {
  const { me } = useStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState(DEMO.adminEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (me?.role === 'admin') return <Navigate to="/admin" replace />
  if (me) return <Navigate to="/" replace />

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const user = db.loginEmail(email, password)
      if (user.role !== 'admin') {
        db.logout()
        throw new Error('This console is for the owner. Use the sale terminal instead.')
      }
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell grid place-items-center px-5">
      <motion.div
        className="glass-strong specular relative w-full max-w-[420px] p-7 sm:p-8"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      >
        <div className="absolute inset-x-8 top-0 overflow-hidden rounded-b-full">
          <Horizon />
        </div>
        <Logo />
        <h1 className="mt-6 text-[1.85rem] font-semibold tracking-tight">Admin Control</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
          Morning check-in for Bloom. Email and password only — no PIN pad here.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <div>
            <label className="field-label">Email</label>
            <input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Password</label>
            <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && (
            <p className="rounded-xl px-3 py-2 text-sm" style={{ background: 'rgba(251,113,133,0.16)', color: '#BE123C' }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn-pink btn-pink-ring w-full" disabled={busy}>
            Sign in
          </button>
        </form>
        <p className="mt-6 text-center text-[0.72rem]" style={{ color: 'var(--ink-4)' }}>
          Demo {DEMO.adminEmail} / {DEMO.adminPassword}
          <br />
          <Link to="/login" className="underline decoration-pink-300">
            Sale Terminal
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
