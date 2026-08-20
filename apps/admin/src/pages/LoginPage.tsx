import { useState } from 'react'
import { ArrowRight, CakeSlice, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { getApiUrl } from '../lib/api'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
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
      <section className="login-visual">
        <div className="login-brand"><span><CakeSlice size={20} /></span><div><strong>Atelier</strong><small>POS Control</small></div></div>
        <div className="login-visual-copy"><span>OWNER OPERATIONS</span><h1>A calmer way to run a fresh cake business.</h1><p>Sales, freshness, cash control and team access—one professional operating view.</p></div>
        <div className="login-system-status"><i /><span><strong>All systems operational</strong><small>Admin · Sale terminal · Shared API</small></span></div>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="login-mobile-brand"><span><CakeSlice size={20} /></span><strong>Atelier</strong></div>
          <div className="login-heading"><span>ADMIN CONTROL</span><h2>Welcome back</h2><p>Sign in with your owner or manager account.</p></div>
          <label><span>Email address</span><div className="login-input"><KeyRound size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@shop.com" autoComplete="email" required /></div></label>
          <label><span>Password</span><div className="login-input"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
          <div className="login-options"><span>Session ends when this tab is refreshed.</span><button type="button">Forgot password?</button></div>
          {error && <div className="login-error">{error}</div>}
          <button className="login-submit" disabled={loading}>{loading ? 'Signing in…' : <>Sign in securely <ArrowRight size={17} /></>}</button>
          <div className="login-security"><ShieldCheck size={16} /><span>Secure Bearer authentication to <code>{getApiUrl()}</code></span></div>
          <p className="no-signup">Accounts are created by your business administrator. Public signup is disabled.</p>
        </form>
      </section>
    </main>
  )
}
