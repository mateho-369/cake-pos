import { Bell, ChevronDown, Menu, Plus, Search, Store } from 'lucide-react'
import type { PageId } from '../data'

const titles: Record<PageId, { title: string; eyebrow: string }> = {
  overview: { title: 'Good morning, Makara', eyebrow: 'Thursday, 20 August' },
  orders: { title: 'Sales & orders', eyebrow: 'Transactions' },
  products: { title: 'Product catalog', eyebrow: 'Inventory' },
  freshness: { title: 'Freshness & waste', eyebrow: 'Inventory control' },
  categories: { title: 'Categories', eyebrow: 'Catalog structure' },
  employees: { title: 'Team & access', eyebrow: 'People' },
  shifts: { title: 'Shifts & cash', eyebrow: 'Cash control' },
  reports: { title: 'Reports & insights', eyebrow: 'Performance' },
  settings: { title: 'Business settings', eyebrow: 'Configuration' },
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
  const heading = titles[page]
  return (
    <header className="topbar">
      <div className="page-heading">
        <button className="icon-button menu-button" onClick={onOpenMenu} aria-label="Open navigation"><Menu size={20} /></button>
        <div>
          <span>{heading.eyebrow}</span>
          <h1>{heading.title}</h1>
        </div>
      </div>

      <div className="header-actions">
        <button className="search-trigger" onClick={onSearch}>
          <Search size={17} />
          <span>Search anything</span>
          <kbd>⌘ K</kbd>
        </button>
        <button className="icon-button notification-button" onClick={onNotifications} aria-label="Notifications">
          <Bell size={19} />
          <span />
        </button>
        {notificationOpen && (
          <div className="notification-popover glass-panel">
            <div className="popover-title"><strong>Notifications</strong><span>3 new</span></div>
            <button><i className="alert-icon coral"><Store size={15} /></i><span><b>3 cakes expire today</b><small>Review stock before the lunch rush</small></span></button>
            <button><i className="alert-icon blue"><CirclePulse /></i><span><b>Shift variance resolved</b><small>Sophea added a closing note</small></span></button>
            <button><i className="alert-icon green"><CheckMini /></i><span><b>Daily backup complete</b><small>Today at 3:00 AM</small></span></button>
            <div className="popover-footer">View notification center</div>
          </div>
        )}
        <button className="primary-button header-add" onClick={onAdd}><Plus size={17} /><span>Add cake</span></button>
        <button className="profile-button">
          <span>MP</span>
          <div><strong>Makara Piseth</strong><small>Owner</small></div>
          <ChevronDown size={15} />
        </button>
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
