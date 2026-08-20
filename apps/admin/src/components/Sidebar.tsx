import {
  BarChart3,
  Boxes,
  CakeSlice,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  LayoutDashboard,
  PackageCheck,
  ReceiptText,
  Settings,
  Tags,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { PageId } from '../data'

type NavItem = { id: PageId; label: string; icon: LucideIcon; badge?: string }

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Workspace',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'orders', label: 'Sales & orders', icon: ReceiptText, badge: '47' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { id: 'products', label: 'Product catalog', icon: CakeSlice },
      { id: 'freshness', label: 'Freshness & waste', icon: PackageCheck, badge: '5' },
      { id: 'categories', label: 'Categories', icon: Tags },
      { id: 'employees', label: 'Team & access', icon: Users },
      { id: 'shifts', label: 'Shifts & cash', icon: Clock3 },
    ],
  },
  {
    title: 'Business',
    items: [
      { id: 'reports', label: 'Reports', icon: BarChart3 },
      { id: 'settings', label: 'Settings', icon: Settings },
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
  return (
    <>
      {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''} ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><CakeSlice size={19} strokeWidth={2.2} /></div>
          {!collapsed && (
            <div className="brand-copy">
              <strong>Atelier</strong>
              <span>POS Control</span>
            </div>
          )}
          <button className="icon-button sidebar-close" onClick={onClose} aria-label="Close navigation"><X size={18} /></button>
        </div>

        <div className="location-card">
          <span className="status-dot" />
          {!collapsed && <div><strong>BKK1 Flagship</strong><span>Phnom Penh · Open</span></div>}
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.title}>
              {!collapsed && <div className="nav-group-title">{group.title}</div>}
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    className={`nav-item ${page === item.id ? 'active' : ''}`}
                    onClick={() => { onNavigate(item.id); onClose() }}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={19} strokeWidth={1.8} />
                    {!collapsed && <span>{item.label}</span>}
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
            {!collapsed && <div><span>Live sales</span><strong>$1,224.50</strong></div>}
          </div>
          <button className="collapse-button" onClick={onToggleCollapsed} aria-label="Toggle navigation width">
            <ChevronLeft size={17} />
            {!collapsed && <span>Collapse sidebar</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
