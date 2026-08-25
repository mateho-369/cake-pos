import {
  BarChart3,
  CakeSlice,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  LayoutDashboard,
  Images,
  PackageCheck,
  ReceiptText,
  Settings,
  Tags,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { GCakeLogo } from '@cake-pos/brand'
import type { PageId } from '../data'
import { useTranslation } from '../lib/i18n'

type NavItem = { id: PageId; label: string; icon: LucideIcon; badge?: string }
const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: 'nav.workspace',
    items: [
      { id: 'overview', label: 'nav.overview', icon: LayoutDashboard },
      { id: 'orders', label: 'nav.orders', icon: ReceiptText, badge: '47' },
      { id: 'customers', label: 'nav.customers', icon: Users },
    ],
  },
  {
    title: 'nav.operations',
    items: [
      { id: 'products', label: 'nav.products', icon: CakeSlice },
      {
        id: 'freshness',
        label: 'nav.freshness',
        icon: PackageCheck,
        badge: '5',
      },
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
}

export default function Sidebar({
  page,
  onNavigate,
  open,
  onClose,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const { t } = useTranslation()
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
        <div className="location-card">
          <span className="status-dot" />
          {!collapsed && (
            <div>
              <strong>{t('nav.location')}</strong>
              <span>{t('nav.locationOpen')}</span>
            </div>
          )}
        </div>
        <nav className="sidebar-nav" aria-label={t('nav.overview')}>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.title}>
              {!collapsed && (
                <div className="nav-group-title">{t(group.title)}</div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon
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
                    {!collapsed && item.badge && <em>{item.badge}</em>}
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
                <strong>$1,224.50</strong>
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
