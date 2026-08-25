import {
  ChevronDown,
  Clock3,
  History,
  LogOut,
  Search,
  ShoppingBag,
  Store,
} from 'lucide-react'
import { useState } from 'react'
import { GCakeLogo } from '@cake-pos/brand'
import { useStaffAuth } from '../auth/StaffAuthContext'
import { LanguageToggle, useTranslation } from '../lib/i18n'
export default function TerminalHeader({
  shiftOpen,
  shiftStartedAt,
  onShift,
  query,
  onQuery,
  cartCount,
  onCart,
  onHistory,
  onCustomerDisplay,
  onAutoPlaceDisplay,
}: {
  shiftOpen: boolean
  shiftStartedAt?: string
  onShift: () => void
  query: string
  onQuery: (value: string) => void
  cartCount: number
  onCart: () => void
  onHistory: () => void
  onCustomerDisplay: () => void
  onAutoPlaceDisplay?: () => void
}) {
  const { employee, signOut } = useStaffAuth()
  const { t } = useTranslation()
  const [profileOpen, setProfileOpen] = useState(false)
  return (
    <header className="terminal-header">
      <div className="terminal-brand">
        <GCakeLogo size={39} className="brand-logo" />
        <div>
          <strong>{t('brand.name')}</strong>
          <small>{t('brand.sale')}</small>
        </div>
      </div>
      <label className="terminal-search">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={t('sale.search')}
        />
        <kbd>⌘K</kbd>
      </label>
      <div className="terminal-header-actions">
        <button
          className="icon-button"
          onClick={onCustomerDisplay}
          title={t('sale.customerDisplay')}
        >
          <ShoppingBag size={18} />
        </button>
        {'getScreenDetails' in window && onAutoPlaceDisplay && (
          <button
            className="icon-button"
            onClick={onAutoPlaceDisplay}
            title={t('sale.autoPlace')}
          >
            ⌗
          </button>
        )}
        <button
          className="icon-button terminal-history-button"
          onClick={onHistory}
          title="Order history"
        >
          <History size={18} />
        </button>
        <button
          className={`shift-status ${shiftOpen ? 'open' : 'closed'}`}
          onClick={onShift}
        >
          <span>
            <i />
            <Clock3 size={15} />
          </span>
          <div>
            <strong>{shiftOpen ? t('shift.open') : t('shift.closed')}</strong>
            <small>
              {shiftOpen
                ? t('shift.started', { time: shiftStartedAt || '' })
                : t('shift.tapToOpen')}
            </small>
          </div>
        </button>
        <button
          className="mobile-cart-button"
          onClick={onCart}
          aria-label={t('sale.openCart')}
        >
          <ShoppingBag size={19} />
          {cartCount > 0 && <span>{cartCount}</span>}
        </button>
        <LanguageToggle />
        <div className="cashier-menu">
          <button
            className="cashier-profile"
            onClick={() => setProfileOpen(!profileOpen)}
          >
            <span>SC</span>
            <div>
              <strong>{employee?.name || 'Sophea Chan'}</strong>
              <small>{t('sale.cashierLocation')}</small>
            </div>
            <ChevronDown size={15} />
          </button>
          {profileOpen && (
            <div className="profile-popover glass-panel">
              <div>
                <span>SC</span>
                <strong>{employee?.name || 'Sophea Chan'}</strong>
                <small>{t('sale.cashierAccount')}</small>
              </div>
              <button>
                <Store size={15} /> {t('sale.location')}
              </button>
              <button onClick={signOut}>
                <LogOut size={15} /> {t('auth.signOut')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
