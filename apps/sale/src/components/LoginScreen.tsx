import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CakeSlice,
  CheckCircle2,
  Delete,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

export default function LoginScreen() {
  const { signIn, signInWithPin } = useAuth()
  const [mode, setMode] = useState<'pin' | 'email'>('pin')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submitPin = async (value = pin) => {
    if (value.length !== 4 || loading) return
    setLoading(true)
    setError('')
    try {
      await signInWithPin(value)
    } catch (reason) {
      setPin('')
      setError(reason instanceof Error ? reason.message : 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  const pressKey = (key: string) => {
    if (loading) return
    setError('')
    if (key === 'clear') return setPin('')
    if (key === 'back') return setPin((current) => current.slice(0, -1))
    if (pin.length >= 4) return
    const next = `${pin}${key}`
    setPin(next)
    if (next.length === 4) window.setTimeout(() => void submitPin(next), 120)
  }

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signIn(email, password)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-showcase">
        <div className="login-brand"><span><CakeSlice size={21} /></span><div><strong>Atelier</strong><small>SALE TERMINAL</small></div></div>
        <div className="showcase-copy"><span>FRESHLY MADE · BEAUTIFULLY SERVED</span><h1>Every order,<br />smoothly served.</h1><p>A fast, focused checkout built around today’s freshest cakes.</p></div>
        <div className="showcase-cakes">
          <div className="showcase-image" />
          <div className="fresh-note"><span><CheckCircle2 size={15} /></span><div><strong>Freshness-first</strong><small>FEFO priority is active</small></div></div>
        </div>
        <div className="showcase-footer"><i /><span>Terminal online</span><b>BKK1 Flagship · Phnom Penh</b></div>
      </section>

      <section className="login-workspace">
        <div className="login-card glass-panel">
          <div className="login-card-heading"><span>STAFF ACCESS</span><h2>Welcome back</h2><p>Sign in to start your counter shift.</p></div>
          <div className="login-tabs"><button className={mode === 'pin' ? 'active' : ''} onClick={() => { setMode('pin'); setError('') }}><KeyRound size={15} /> Quick PIN</button><button className={mode === 'email' ? 'active' : ''} onClick={() => { setMode('email'); setError('') }}><Mail size={15} /> Email</button></div>

          {mode === 'pin' ? (
            <div className="pin-flow">
              <div className="pin-label"><strong>Enter your 4-digit PIN</strong><span>Keep your PIN private</span></div>
              <div className={`pin-dots ${error ? 'has-error' : ''}`} aria-label={`${pin.length} of 4 PIN digits entered`}>
                {[0, 1, 2, 3].map((index) => <i className={index < pin.length ? 'filled' : ''} key={index} />)}
              </div>
              <div className="pin-pad">
                {['1','2','3','4','5','6','7','8','9','clear','0','back'].map((key) => (
                  <button key={key} className={key === 'clear' || key === 'back' ? 'key-action' : ''} onClick={() => pressKey(key)} disabled={loading} aria-label={key === 'back' ? 'Delete digit' : key === 'clear' ? 'Clear PIN' : `Digit ${key}`}>
                    {key === 'back' ? <Delete size={20} /> : key === 'clear' ? 'Clear' : key}
                  </button>
                ))}
              </div>
              {error && <div className="login-error"><LockKeyhole size={14} />{error}</div>}
              <button className="pin-submit" onClick={() => void submitPin()} disabled={pin.length !== 4 || loading}>{loading ? 'Signing in…' : <>Continue <ArrowRight size={17} /></>}</button>
              {(import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true') && <div className="demo-hint"><span>DEMO</span> Use PIN <strong>1234</strong></div>}
            </div>
          ) : (
            <form className="email-flow" onSubmit={submitEmail}>
              <label><span>Email address</span><div className="auth-input"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@shop.com" autoComplete="email" required /></div></label>
              <label><span>Password</span><div className="auth-input"><LockKeyhole size={16} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
              {error && <div className="login-error"><LockKeyhole size={14} />{error}</div>}
              <button className="pin-submit" disabled={loading}>{loading ? 'Signing in…' : <>Sign in securely <ArrowRight size={17} /></>}</button>
              <button type="button" className="back-to-pin" onClick={() => setMode('pin')}><ArrowLeft size={14} /> Back to quick PIN</button>
            </form>
          )}

          <div className="auth-security"><ShieldCheck size={15} /><span>Secure Bearer authentication · Session held in memory only</span></div>
        </div>
      </section>
    </main>
  )
}
