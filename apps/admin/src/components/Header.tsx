import { Bell, ChevronDown, Menu, Plus, Search, Store } from 'lucide-react'
import type { PageId } from '../data'
import { LanguageToggle, useTranslation } from '../lib/i18n'

const titles: Record<PageId, { title: string; eyebrow: string }> = {
  overview: { title: 'header.morning', eyebrow: 'header.date' },
  orders: { title: 'nav.orders', eyebrow: 'header.transactions' },
  products: { title: 'nav.products', eyebrow: 'header.inventory' },
  freshness: { title: 'nav.freshness', eyebrow: 'header.inventoryControl' },
  categories: { title: 'nav.categories', eyebrow: 'header.catalogStructure' },
  employees: { title: 'nav.employees', eyebrow: 'header.people' },
  shifts: { title: 'nav.shifts', eyebrow: 'header.cashControl' },
  reports: { title: 'header.reports', eyebrow: 'header.performance' },
  settings: { title: 'header.settings', eyebrow: 'header.configuration' },
}

type HeaderProps = {
  page: PageId
  onOpenMenu: () => void
  onAdd: () => void
  onSearch: () => void
  onNotifications: () => void
  notificationOpen: boolean
}

export default function Header({ page, onOpenMenu, onAdd, onSearch, onNotifications, notificationOpen }: HeaderProps) {
  const { t } = useTranslation()
  const heading = titles[page]
  return (
    <header className="topbar">
      <div className="page-heading">
        <button className="icon-button menu-button" onClick={onOpenMenu} aria-label={t('nav.openNavigation')}><Menu size={20} /></button>
        <div><span>{t(heading.eyebrow)}</span><h1>{t(heading.title)}</h1></div>
      </div>

      <div className="header-actions">
        <button className="search-trigger" onClick={onSearch}><Search size={17} /><span>{t('header.searchAnything')}</span><kbd>⌘ K</kbd></button>
        <button className="icon-button notification-button" onClick={onNotifications} aria-label={t('header.notifications')}><Bell size={19} /><span /></button>
        {notificationOpen && (
          <div className="notification-popover glass-panel">
            <div className="popover-title"><strong>{t('header.notifications')}</strong><span>{t('header.newCount')}</span></div>
            <button><i className="alert-icon coral"><Store size={15} /></i><span><b>{t('header.expireToday')}</b><small>{t('header.reviewLunch')}</small></span></button>
            <button><i className="alert-icon blue"><CirclePulse /></i><span><b>{t('header.varianceResolved')}</b><small>{t('header.closingNote')}</small></span></button>
            <button><i className="alert-icon green"><CheckMini /></i><span><b>{t('header.backupComplete')}</b><small>{t('header.backupTime')}</small></span></button>
            <div className="popover-footer">{t('header.notificationCenter')}</div>
          </div>
        )}
        <LanguageToggle />
        <button className="primary-button header-add" onClick={onAdd}><Plus size={17} /><span>{t('header.addCake')}</span></button>
        <button className="profile-button"><span>MP</span><div><strong>Makara Piseth</strong><small>{t('header.owner')}</small></div><ChevronDown size={15} /></button>
      </div>
    </header>
  )
}

function CirclePulse() { return <span className="circle-pulse" /> }
function CheckMini() { return <span className="check-mini">✓</span> }
