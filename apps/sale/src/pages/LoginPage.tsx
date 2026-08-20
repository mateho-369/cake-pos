import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Logo from '@bloom/shared/components/Logo'
import PinPad from '@bloom/shared/components/PinPad'
import Horizon from '@bloom/shared/components/Horizon'
import { DEMO, useAuth } from '@bloom/shared'

export default function LoginPage() {
  const { user, loginPin, loginEmail } = useAuth()
  const [mode, setMode] = useState<'pin' | 'email'>('pin')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const submitPin = async (value: string) => {
    setBusy(true)
    setError('')
    try {
      await loginPin(value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await loginEmail(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell relative grid place-items-center overflow-hidden px-5">
      <motion.div
        className="glass-strong specular relative w-full max-w-[420px] p-7 sm:p-8"
        initial={{ y: 18, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      >
        <div className="absolute inset-x-8 top-0 overflow-hidden rounded-b-full">
          <Horizon />
        </div>
        <Logo />
        <h1 className="mt-6 text-[1.85rem] font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
          {mode === 'pin' ? 'Enter your 4-digit PIN to start selling.' : 'Owner or email login.'}
        </p>

        <div className="mt-5 mb-6 flex gap-2">
          <button type="button" className={`pill ${mode === 'pin' ? 'pill-active' : ''}`} onClick={() => setMode('pin')}>
            PIN pad
          </button>
          <button type="button" className={`pill ${mode === 'email' ? 'pill-active' : ''}`} onClick={() => setMode('email')}>
            Email
          </button>
        </div>

        {mode === 'pin' ? (
          <PinPad value={pin} onChange={setPin} onComplete={(v) => void submitPin(v)} disabled={busy} />
        ) : (
          <form onSubmit={(e) => void submitEmail(e)} className="space-y-3">
            <div>
              <label className="field-label">Email</label>
              <input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Password</label>
              <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="btn-pink btn-pink-ring w-full" disabled={busy}>
              Sign in
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 rounded-xl px-3 py-2 text-sm" style={{ background: 'rgba(251,113,133,0.16)', color: '#BE123C' }}>
            {error}
          </p>
        )}

        <p className="mt-6 text-center text-[0.72rem] leading-relaxed" style={{ color: 'var(--ink-4)' }}>
          Demo cashier PIN {DEMO.cashierPin} · owner {DEMO.adminEmail} / {DEMO.adminPassword}
          <br />
          Token stays in memory — refresh signs you out. No Telegram auto-login.
        </p>
      </motion.div>
    </div>
  )
}
