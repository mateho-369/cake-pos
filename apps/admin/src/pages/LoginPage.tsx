import { useState } from 'react'
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react'
import { GCakeLogo } from '@cake-pos/brand'
import { useStaffAuth } from '../auth/StaffAuthContext'
import { getApiUrl } from '../lib/api'
import { LanguageToggle, useTranslation } from '../lib/i18n'

export default function LoginPage() {
  const { signIn } = useStaffAuth()
  const { t } = useTranslation()
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
      setError(reason instanceof Error ? reason.message : t('auth.unable'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="login-brand">
          <GCakeLogo size={39} className="brand-logo" />
          <div>
            <strong>{t('brand.name')}</strong>
            <small>{t('brand.admin')}</small>
          </div>
        </div>
        <div className="login-visual-copy">
          <span>{t('auth.ownerOperations')}</span>
          <h1>{t('auth.calmer')}</h1>
          <p>{t('auth.operationsDescription')}</p>
        </div>
        <div className="login-system-status">
          <i />
          <span>
            <strong>{t('auth.systemsOperational')}</strong>
            <small>{t('auth.systemDetails')}</small>
          </span>
        </div>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="login-mobile-brand">
            <GCakeLogo size={36} className="brand-logo" />
            <strong>{t('brand.name')}</strong>
          </div>
          <div className="login-heading">
            <span>{t('auth.adminControl')}</span>
            <h2>{t('auth.welcome')}</h2>
            <p>{t('auth.adminWelcome')}</p>
          </div>
          <label>
            <span>{t('auth.email')}</span>
            <div className="login-input">
              <KeyRound size={17} />
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
            <div className="login-input">
              <LockKeyhole size={17} />
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
                  showPassword ? t('auth.hidePassword') : t('auth.showPassword')
                }
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <div className="login-options">
            <span>{t('auth.sessionNotice')}</span>
            <button type="button">{t('auth.forgotPassword')}</button>
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="login-submit" disabled={loading}>
            {loading ? (
              t('common.loading')
            ) : (
              <>
                {t('auth.signIn')} <ArrowRight size={17} />
              </>
            )}
          </button>
          <div className="login-security">
            <ShieldCheck size={16} />
            <span>
              {t('auth.security')} <code>{getApiUrl()}</code>
            </span>
          </div>
          <p className="no-signup">{t('auth.noSignup')}</p>
          <LanguageToggle />
        </form>
      </section>
    </main>
  )
}
