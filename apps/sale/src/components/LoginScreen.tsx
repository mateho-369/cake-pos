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
import { useStaffAuth } from '../auth/StaffAuthContext'
import { LanguageToggle, useTranslation } from '../lib/i18n'
export default function LoginScreen() {
  const { signIn, signInWithPin } = useStaffAuth()
  const { t } = useTranslation()
  const [mode, setMode] = useState<'pin' | 'email'>('pin')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const displayError = (reason: unknown) => {
    if (reason instanceof Error)
      return reason.message === 'auth.incorrectPin'
        ? t('auth.incorrectPin')
        : reason.message
    return t('auth.unable')
  }
  const submitPin = async (value = pin) => {
    if (value.length !== 4 || loading) return
    setLoading(true)
    setError('')
    try {
      await signInWithPin(value)
    } catch (reason) {
      setPin('')
      setError(displayError(reason))
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
      setError(displayError(reason))
    } finally {
      setLoading(false)
    }
  }
  const keys = [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    'clear',
    '0',
    'back',
  ]
  return (
    <main className="login-page">
      <section className="login-showcase">
        <div className="login-brand">
          <span>
            <CakeSlice size={21} />
          </span>
          <div>
            <strong>{t('brand.name')}</strong>
            <small>{t('brand.sale')}</small>
          </div>
        </div>
        <div className="showcase-copy">
          <span>{t('sale.showcaseKicker')}</span>
          <h1>
            {t('sale.showcaseTitle')}
            <br />
            {t('sale.showcaseTitle2')}
          </h1>
          <p>{t('sale.showcaseDescription')}</p>
        </div>
        <div className="showcase-cakes">
          <div className="showcase-image" />
          <div className="fresh-note">
            <span>
              <CheckCircle2 size={15} />
            </span>
            <div>
              <strong>{t('sale.freshnessFirst')}</strong>
              <small>{t('sale.fefoActive')}</small>
            </div>
          </div>
        </div>
        <div className="showcase-footer">
          <i />
          <span>{t('sale.terminalOnline')}</span>
          <b>{t('sale.locationPhnomPenh')}</b>
        </div>
      </section>
      <section className="login-workspace">
        <div className="login-card glass-panel">
          <div className="login-card-heading">
            <span>{t('auth.staffAccess')}</span>
            <h2>{t('auth.welcome')}</h2>
            <p>{t('auth.staffWelcome')}</p>
          </div>
          <div className="login-tabs">
            <button
              className={mode === 'pin' ? 'active' : ''}
              onClick={() => {
                setMode('pin')
                setError('')
              }}
            >
              <KeyRound size={15} /> {t('auth.quickPin')}
            </button>
            <button
              className={mode === 'email' ? 'active' : ''}
              onClick={() => {
                setMode('email')
                setError('')
              }}
            >
              <Mail size={15} /> {t('auth.pinEmail')}
            </button>
          </div>
          {mode === 'pin' ? (
            <div className="pin-flow">
              <div className="pin-label">
                <strong>{t('auth.pinPrompt')}</strong>
                <span>{t('auth.keepPrivate')}</span>
              </div>
              <div
                className={`pin-dots ${error ? 'has-error' : ''}`}
                aria-label={`${pin.length} ${t('auth.pinOf')} 4`}
              >
                {[0, 1, 2, 3].map((index) => (
                  <i
                    className={index < pin.length ? 'filled' : ''}
                    key={index}
                  />
                ))}
              </div>
              <div className="pin-pad">
                {keys.map((key) => (
                  <button
                    key={key}
                    className={
                      key === 'clear' || key === 'back' ? 'key-action' : ''
                    }
                    onClick={() => pressKey(key)}
                    disabled={loading}
                    aria-label={
                      key === 'back'
                        ? t('auth.deleteDigit')
                        : key === 'clear'
                          ? t('auth.clearPin')
                          : t('auth.digit', { value: key })
                    }
                  >
                    {key === 'back' ? (
                      <Delete size={20} />
                    ) : key === 'clear' ? (
                      t('common.clear')
                    ) : (
                      key
                    )}
                  </button>
                ))}
              </div>
              {error && (
                <div className="login-error">
                  <LockKeyhole size={14} />
                  {error}
                </div>
              )}
              <button
                className="pin-submit"
                onClick={() => void submitPin()}
                disabled={pin.length !== 4 || loading}
              >
                {loading ? (
                  t('common.loading')
                ) : (
                  <>
                    {t('auth.continue')} <ArrowRight size={17} />
                  </>
                )}
              </button>
              {import.meta.env.VITE_DEMO_MODE === 'true' && (
                <div className="demo-hint">
                  <span>{t('auth.demo')}</span> {t('auth.demoUse')}{' '}
                  <strong>1234</strong>
                </div>
              )}
            </div>
          ) : (
            <form className="email-flow" onSubmit={submitEmail}>
              <label>
                <span>{t('auth.email')}</span>
                <div className="auth-input">
                  <Mail size={16} />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t('auth.emailPlaceholder')}
                    autoComplete="email"
                    required
                  />
                </div>
              </label>
              <label>
                <span>{t('auth.password')}</span>
                <div className="auth-input">
                  <LockKeyhole size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t('auth.passwordPlaceholder')}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword
                        ? t('auth.hidePassword')
                        : t('auth.showPassword')
                    }
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              {error && (
                <div className="login-error">
                  <LockKeyhole size={14} />
                  {error}
                </div>
              )}
              <button className="pin-submit" disabled={loading}>
                {loading ? (
                  t('common.loading')
                ) : (
                  <>
                    {t('auth.signIn')} <ArrowRight size={17} />
                  </>
                )}
              </button>
              <button
                type="button"
                className="back-to-pin"
                onClick={() => setMode('pin')}
              >
                <ArrowLeft size={14} /> {t('auth.backPin')}
              </button>
            </form>
          )}
          <div className="auth-security">
            <ShieldCheck size={15} />
            <span>{t('auth.securityMemory')}</span>
          </div>
          <LanguageToggle />
        </div>
      </section>
    </main>
  )
}
