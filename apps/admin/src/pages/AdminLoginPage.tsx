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
      <div className="auth-shell">
        <div className="auth-card glass-strong text-center">
          <p className="font-semibold">Owner console only</p>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-3)' }}>
            Signed in as {user.name}. Use the sale terminal instead.
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
        throw new Error('This console is for the owner.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <motion.div
        className="auth-card admin-auth glass-strong relative"
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <div className="absolute inset-x-10 top-0 overflow-hidden rounded-b-full">
          <Horizon />
        </div>
        <Logo />
        <h1>Admin Control</h1>
        <p className="text-[0.8rem]" style={{ color: 'var(--ink-3)' }}>
          Email and password. No PIN pad here.
        </p>
        <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-3">
          <div>
            <label className="field-label">Email</label>
            <input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Password</label>
            <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && (
            <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(251,113,133,0.16)', color: '#BE123C' }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn-pink w-full" disabled={busy}>
            Sign in
          </button>
        </form>
        <p className="mt-4 text-center text-[0.7rem]" style={{ color: 'var(--ink-4)' }}>
          {DEMO.adminEmail} / {DEMO.adminPassword}
        </p>
      </motion.div>
    </div>
  )
}
