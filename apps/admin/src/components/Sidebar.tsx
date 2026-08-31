import { useEffect, useState } from 'react'
import {
  BarChart3,
  CakeSlice,
  ChevronDown,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  LayoutDashboard,
  Images,
  PackageCheck,
  Pencil,
  ReceiptText,
  Settings,
  Tags,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { apiRequest } from '../lib/api'
import { REPORT_TABS } from '../lib/reportNav'
import { GCakeLogo } from '@cake-pos/brand'
import type { PageId } from '../data'
import { useAdminData } from '../lib/data'
import { useTranslation } from '../lib/i18n'

type NavItem = { id: PageId; label: string; icon: LucideIcon }
const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: 'nav.workspace',
    items: [
      { id: 'overview', label: 'nav.overview', icon: LayoutDashboard },
      { id: 'orders', label: 'nav.orders', icon: ReceiptText },
      { id: 'customers', label: 'nav.customers', icon: Users },
    ],
  },
  {
    title: 'nav.operations',
    items: [
      { id: 'products', label: 'nav.products', icon: CakeSlice },
      { id: 'freshness', label: 'nav.freshness', icon: PackageCheck },
      { id: 'categories', label: 'nav.categories', icon: Tags },
      { id: 'employees', label: 'nav.employees', icon: Users },
      { id: 'shifts', label: 'nav.shifts', icon: Clock3 },
    ],
  },
  {
    title: 'nav.business',
    items: [
      { id: 'reports', label: 'nav.reports', icon: BarChart3 },
      { id: 'settings', label: 'nav.settings', icon: Settings },
      { id: 'media', label: 'nav.media', icon: Images },
    ],
  },
]

type SidebarProps = {
  page: PageId
  onNavigate: (page: PageId) => void
  open: boolean
  onClose: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
  onOpenReportTab: (tabId: string) => void
  onEditLocation: () => void
}

export default function Sidebar({
  page,
  onNavigate,
  open,
  onClose,
  collapsed,
  onToggleCollapsed,
  onOpenReportTab,
  onEditLocation,
}: SidebarProps) {
  const { t } = useTranslation()
  const { orders, customers, categories, products, summary } = useAdminData()
  const [reportsOpen, setReportsOpen] = useState(false)
  // The location card shows the REAL business profile (editable in Settings)
  // instead of a hardcoded branch name.
  const [profile, setProfile] = useState<{
    businessName?: string
    locationName?: string
    address?: string
  } | null>(null)
  useEffect(() => {
    let alive = true
    apiRequest<{
      businessName?: string
      locationName?: string
      address?: string
    }>('/api/settings/business-profile')
      .then((value) => alive && setProfile(value))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  // Every badge is derived from the same live API collections the page bodies
  // render; a store with no data shows no badges, never a hardcoded number.
  const badgeFor = (id: PageId): string | undefined => {
    switch (id) {
      case 'orders':
        return orders.length > 0 ? String(orders.length) : undefined
      case 'customers':
        return customers.length > 0 ? String(customers.length) : undefined
      case 'categories':
        return categories.length > 0 ? String(categories.length) : undefined
      case 'freshness': {
        const atRisk = products.filter((product) =>
          ['Expires today', '1 day left'].includes(product.status),
        ).length
        return atRisk > 0 ? String(atRisk) : undefined
      }
      default:
        return undefined
    }
  }
  const liveSales = summary?.todaySalesTotal ?? 0
  return (
    <>
      {open && (
        <button
          className="sidebar-backdrop"
          aria-label={t('nav.closeNavigation')}
          onClick={onClose}
        />
      )}
      <aside
        className={`sidebar ${open ? 'sidebar-open' : ''} ${collapsed ? 'sidebar-collapsed' : ''}`}
      >
        <div className="brand-row">
          <GCakeLogo size={38} className="brand-logo" />
          {!collapsed && (
            <div className="brand-copy">
              <strong>{t('brand.name')}</strong>
              <span>{t('brand.admin')}</span>
            </div>
          )}
          <button
            className="icon-button sidebar-close"
            onClick={onClose}
            aria-label={t('nav.closeNavigation')}
          >
            <X size={18} />
          </button>
        </div>
        <button
          className="location-card"
          type="button"
          onClick={onEditLocation}
          title={t('settings.businessProfile')}
        >
          <span className="status-dot" />
          {!collapsed && (
            <div>
              <strong>{profile?.businessName || t('nav.location')}</strong>
              <span>
                {profile?.locationName ||
                  (profile?.address ? profile.address : t('nav.locationOpen'))}
              </span>
            </div>
          )}
          {!collapsed && <Pencil size={13} className="location-edit" />}
        </button>
        <nav className="sidebar-nav" aria-label={t('nav.overview')}>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.title}>
              {!collapsed && (
                <div className="nav-group-title">{t(group.title)}</div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon
                const badge = badgeFor(item.id)
                if (item.id === 'reports') {
                  return (
                    <div
                      key={item.id}
                      className={`nav-item-group ${reportsOpen ? 'open' : ''}`}
                    >
                      <button
                        className={`nav-item ${page === 'reports' ? 'active' : ''}`}
                        onClick={() => {
                          if (collapsed) {
                            onNavigate('reports')
                            onClose()
                            return
                          }
                          setReportsOpen((open) => !open)
                        }}
                        aria-expanded={!collapsed ? reportsOpen : undefined}
                        aria-haspopup={!collapsed ? 'menu' : undefined}
                        title={collapsed ? t(item.label) : undefined}
                      >
                        <Icon size={19} strokeWidth={1.8} />
                        {!collapsed && <span>{t(item.label)}</span>}
                        {!collapsed && (
                          <ChevronDown size={14} className="nav-chev" />
                        )}
                      </button>
                      {!collapsed && reportsOpen && (
                        <div className="nav-submenu">
                          <div className="nav-submenu-label">
                            {t('reports.views')}
                          </div>
                          {REPORT_TABS.map((tab) => (
                            <button
                              key={tab.id}
                              className="nav-submenu-item"
                              onClick={() => {
                                onOpenReportTab(tab.id)
                                onClose()
                              }}
                            >
                              {t(tab.labelKey)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }
                return (
                  <button
                    key={item.id}
                    className={`nav-item ${page === item.id ? 'active' : ''}`}
                    onClick={() => {
                      onNavigate(item.id)
                      onClose()
                    }}
                    title={collapsed ? t(item.label) : undefined}
                  >
                    <Icon size={19} strokeWidth={1.8} />
                    {!collapsed && <span>{t(item.label)}</span>}
                    {!collapsed && badge && <em>{badge}</em>}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="live-card">
            <CircleDollarSign size={18} />
            {!collapsed && (
              <div>
                <span>{t('nav.liveSales')}</span>
                <strong>
                  $
                  {liveSales.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </strong>
              </div>
            )}
          </div>
          <button
            className="collapse-button"
            onClick={onToggleCollapsed}
            aria-label={t('nav.toggleNavigation')}
          >
            <ChevronLeft size={17} />
            {!collapsed && <span>{t('nav.collapse')}</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
