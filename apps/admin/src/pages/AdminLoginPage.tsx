import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Logo from '@bloom/shared/components/Logo'
import Horizon from '@bloom/shared/components/Horizon'
import { DEMO, useAuth } from '@bloom/shared'

export default function AdminLoginPage() {
  const { user, loginEmail, logout } = useAuth()
  const [email, setEmail] = useState(DEMO.adminEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user?.role === 'admin') return <Navigate to="/" replace />
  if (user) {
    return (
      <div className="app-shell grid place-items-center px-5">
        <div className="glass-strong max-w-md p-7 text-center">
          <p className="font-semibold">This console is for the owner.</p>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-3)' }}>
            Signed in as {user.name} ({user.role}). Use the sale terminal instead.
          </p>
          <button type="button" className="btn-pink mt-4" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const next = await loginEmail(email, password)
      if (next.role !== 'admin') {
        await logout()
        throw new Error('This console is for the owner. Use the sale terminal instead.')
      }
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
          Morning check-in for Bloom. Email and password only — bearer token, no cookies.
        </p>
        <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-3">
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
          Token stays in memory — refresh signs you out.
        </p>
      </motion.div>
    </div>
  )
}
