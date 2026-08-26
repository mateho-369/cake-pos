import { useEffect, useRef } from 'react'
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  Store,
} from 'lucide-react'
import type { PageId } from '../data'
import { useStaffAuth } from '../auth/StaffAuthContext'
import { LanguageToggle, useTranslation } from '../lib/i18n'

const titles: Record<PageId, { title: string; eyebrow: string }> = {
  overview: { title: 'header.morning', eyebrow: 'header.date' },
  orders: { title: 'nav.orders', eyebrow: 'header.transactions' },
  customers: { title: 'nav.customers', eyebrow: 'header.people' },
  products: { title: 'nav.products', eyebrow: 'header.inventory' },
  freshness: { title: 'nav.freshness', eyebrow: 'header.inventoryControl' },
  categories: { title: 'nav.categories', eyebrow: 'header.catalogStructure' },
  employees: { title: 'nav.employees', eyebrow: 'header.people' },
  shifts: { title: 'nav.shifts', eyebrow: 'header.cashControl' },
  reports: { title: 'header.reports', eyebrow: 'header.performance' },
  settings: { title: 'header.settings', eyebrow: 'header.configuration' },
  media: { title: 'nav.media', eyebrow: 'header.configuration' },
}

type HeaderProps = {
  page: PageId
  onOpenMenu: () => void
  onAdd: () => void
  onSearch: () => void
  onNotifications: () => void
  notificationOpen: boolean
  profileOpen: boolean
  onToggleProfile: () => void
  onCloseProfile: () => void
  onOpenSettings: () => void
}

const profileMenuItems = [
  { id: 'settings', label: 'header.accountSettings', icon: Settings },
  { id: 'signout', label: 'header.signOut', icon: LogOut },
] as const

export default function Header({
  page,
  onOpenMenu,
  onAdd,
  onSearch,
  onNotifications,
  notificationOpen,
  profileOpen,
  onToggleProfile,
  onCloseProfile,
  onOpenSettings,
}: HeaderProps) {
  const { t } = useTranslation()
  const { employee, signOut } = useStaffAuth()
  const heading = titles[page]
  const employeeName = employee?.name || 'Makara Piseth'
  const initials = employeeName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const roleLabel =
    employee?.role === 'admin' ? t('header.adminRole') : t('header.cashierRole')
  const profileRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!profileOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        onCloseProfile()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [profileOpen, onCloseProfile])
  const handleProfileClick = (action: string) => {
    onCloseProfile()
    if (action === 'signout') void signOut()
    if (action === 'settings') onOpenSettings()
  }
  return (
    <header className="topbar">
      <div className="page-heading">
        <button
          className="icon-button menu-button"
          onClick={onOpenMenu}
          aria-label={t('nav.openNavigation')}
        >
          <Menu size={20} />
        </button>
        <div>
          <span>{t(heading.eyebrow)}</span>
          <h1>{t(heading.title)}</h1>
        </div>
      </div>

      <div className="header-actions">
        <button className="search-trigger" onClick={onSearch}>
          <Search size={17} />
          <span>{t('header.searchAnything')}</span>
          <kbd>⌘ K</kbd>
        </button>
        <button
          className="icon-button notification-button"
          onClick={onNotifications}
          aria-label={t('header.notifications')}
        >
          <Bell size={19} />
          <span />
        </button>
        {notificationOpen && (
          <div className="notification-popover glass-panel">
            <div className="popover-title">
              <strong>{t('header.notifications')}</strong>
              <span>{t('header.newCount')}</span>
            </div>
            <button>
              <i className="alert-icon coral">
                <Store size={15} />
              </i>
              <span>
                <b>{t('header.expireToday')}</b>
                <small>{t('header.reviewLunch')}</small>
              </span>
            </button>
            <button>
              <i className="alert-icon blue">
                <CirclePulse />
              </i>
              <span>
                <b>{t('header.varianceResolved')}</b>
                <small>{t('header.closingNote')}</small>
              </span>
            </button>
            <button>
              <i className="alert-icon green">
                <CheckMini />
              </i>
              <span>
                <b>{t('header.backupComplete')}</b>
                <small>{t('header.backupTime')}</small>
              </span>
            </button>
            <div className="popover-footer">
              {t('header.notificationCenter')}
            </div>
          </div>
        )}
        <LanguageToggle />
        <button className="primary-button header-add" onClick={onAdd}>
          <Plus size={17} />
          <span>{t('header.addCake')}</span>
        </button>
        <div className="profile-menu-wrap">
          <button
            className="profile-button"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={onToggleProfile}
          >
            <span>{initials}</span>
            <div>
              <strong>{employeeName}</strong>
              <small>{roleLabel}</small>
            </div>
            <ChevronDown size={15} />
          </button>
          {profileOpen && (
            <div className="profile-popover glass-panel" role="menu">
              <div className="profile-popover-head">
                <span className="profile-avatar-lg">{initials}</span>
                <div>
                  <strong>{employeeName}</strong>
                  <small>{employee?.email || 'owner@atelier.local'}</small>
                </div>
              </div>
              <div className="profile-menu-items">
                {profileMenuItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      role="menuitem"
                      onClick={() => handleProfileClick(item.id)}
                    >
                      <Icon size={16} />
                      <span>{t(item.label)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function CirclePulse() {
  return <span className="circle-pulse" />
}
function CheckMini() {
  return <span className="check-mini">✓</span>
}
