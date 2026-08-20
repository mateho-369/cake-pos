import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CakeSlice,
  Camera,
  Check,
  CircleDollarSign,
  Clock3,
  ImagePlus,
  LayoutDashboard,
  PackageCheck,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Tags,
  Upload,
  Users,
  X,
} from 'lucide-react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Modal from './components/Modal'
import type { PageId } from './data'
import Dashboard from './pages/Dashboard'
import ProductsPage from './pages/ProductsPage'
import OrdersPage from './pages/OrdersPage'
import FreshnessPage from './pages/FreshnessPage'
import CategoriesPage from './pages/CategoriesPage'
import EmployeesPage from './pages/EmployeesPage'
import ShiftsPage from './pages/ShiftsPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'
import LoginPage from './pages/LoginPage'
import { useAuth } from './auth/AuthContext'

const commandItems: { id: PageId; label: string; detail: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', detail: 'Business performance', icon: <LayoutDashboard size={18} /> },
  { id: 'orders', label: 'Sales & orders', detail: 'Transactions and receipts', icon: <ReceiptText size={18} /> },
  { id: 'products', label: 'Product catalog', detail: 'Products, stock and pricing', icon: <CakeSlice size={18} /> },
  { id: 'freshness', label: 'Freshness & waste', detail: 'FEFO queue and waste log', icon: <PackageCheck size={18} /> },
  { id: 'categories', label: 'Categories', detail: 'Sale-terminal organization', icon: <Tags size={18} /> },
  { id: 'employees', label: 'Team & access', detail: 'Employees and permissions', icon: <Users size={18} /> },
  { id: 'shifts', label: 'Shifts & cash', detail: 'Drawer reconciliation', icon: <Clock3 size={18} /> },
  { id: 'reports', label: 'Reports', detail: 'Sales and operational insight', icon: <CircleDollarSign size={18} /> },
  { id: 'settings', label: 'Settings', detail: 'Business configuration', icon: <Settings size={18} /> },
]

export default function App() {
  const { token } = useAuth()
  const demoMode = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true'
  const [page, setPage] = useState<PageId>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
      if (event.key === 'Escape') {
        setCommandOpen(false)
        setAddOpen(false)
        setNotificationsOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const navigate = (nextPage: PageId) => {
    setPage(nextPage)
    setCommandOpen(false)
    setCommandQuery('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openOrder = (id: string) => {
    setSelectedOrder(id)
    navigate('orders')
  }

  const addProduct = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAddOpen(false)
    setPhotoPreview(null)
    setToast('Cake added and published to the sale terminal')
  }

  if (!demoMode && !token) return <LoginPage />

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'app-collapsed' : ''}`}>
      <Sidebar page={page} onNavigate={navigate} open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <main className="main-shell">
        <Header
          page={page}
          onOpenMenu={() => setSidebarOpen(true)}
          onAdd={() => setAddOpen(true)}
          onSearch={() => setCommandOpen(true)}
          onNotifications={() => setNotificationsOpen(!notificationsOpen)}
          notificationOpen={notificationsOpen}
        />
        {page === 'overview' && <Dashboard onNavigate={navigate} onOrder={openOrder} onToast={setToast} />}
        {page === 'products' && <ProductsPage onAdd={() => setAddOpen(true)} onToast={setToast} />}
        {page === 'orders' && <OrdersPage selectedId={selectedOrder} onSelect={setSelectedOrder} onToast={setToast} />}
        {page === 'freshness' && <FreshnessPage onToast={setToast} />}
        {page === 'categories' && <CategoriesPage onToast={setToast} />}
        {page === 'employees' && <EmployeesPage onToast={setToast} />}
        {page === 'shifts' && <ShiftsPage onToast={setToast} />}
        {page === 'reports' && <ReportsPage onToast={setToast} />}
        {page === 'settings' && <SettingsPage onToast={setToast} />}
      </main>

      <AddCakeModal open={addOpen} onClose={() => { setAddOpen(false); setPhotoPreview(null) }} onSubmit={addProduct} photoPreview={photoPreview} setPhotoPreview={setPhotoPreview} />
      <CommandPalette open={commandOpen} query={commandQuery} setQuery={setCommandQuery} onClose={() => setCommandOpen(false)} onNavigate={navigate} onAdd={() => { setCommandOpen(false); setAddOpen(true) }} />
      {toast && <div className="toast-message"><span><Check size={15} /></span>{toast}<button onClick={() => setToast(null)}><X size={15} /></button></div>}
    </div>
  )
}

function AddCakeModal({ open, onClose, onSubmit, photoPreview, setPhotoPreview }: {
  open: boolean
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  photoPreview: string | null
  setPhotoPreview: (value: string | null) => void
}) {
  const [category, setCategory] = useState('Signature')
  const [madeToday, setMadeToday] = useState(true)

  const onPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) setPhotoPreview(URL.createObjectURL(file))
  }

  return (
    <Modal open={open} onClose={onClose} eyebrow="Quick entry · under 30 seconds" title="Add a fresh cake" size="large">
      <form className="add-cake-form" onSubmit={onSubmit}>
        <label className={`photo-upload ${photoPreview ? 'has-photo' : ''}`} style={photoPreview ? { backgroundImage: `url(${photoPreview})` } : undefined}>
          <input type="file" accept="image/*" capture="environment" onChange={onPhoto} />
          {!photoPreview && <><span className="photo-upload-icon"><Camera size={25} /></span><strong>Take or upload a product photo</strong><small>Square image recommended · JPEG, PNG or WebP</small><em><Upload size={15} /> Choose photo</em></>}
          {photoPreview && <span className="replace-photo"><ImagePlus size={16} /> Replace photo</span>}
        </label>
        <div className="quick-fields">
          <div className="form-grid two-columns">
            <label><span>Name</span><input autoFocus={!photoPreview} placeholder="e.g. Strawberry Cloud" required /></label>
            <label><span>Price</span><div className="currency-input"><span>$</span><input type="number" placeholder="0.00" min="0" step="0.01" required /></div></label>
          </div>
          <label><span>Category</span><div className="category-chips">{['Signature', 'Birthday', 'Cheesecake', 'Mini cakes', 'Chocolate'].map((item) => <button type="button" key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div></label>
          <div className="quick-secondary-fields"><label><span>Starting stock</span><input type="number" min="0" defaultValue="1" required /></label><label className="made-today-toggle"><span><strong>Made today</strong><small>{madeToday ? 'Best before auto-set to Aug 23' : 'Choose production date'}</small></span><input type="checkbox" checked={madeToday} onChange={(event) => setMadeToday(event.target.checked)} /><i /></label></div>
          {!madeToday && <div className="form-grid two-columns compact-date-fields"><label><span>Made at</span><input type="date" defaultValue="2026-08-20" /></label><label><span>Best before</span><input type="date" defaultValue="2026-08-23" /></label></div>}
          <div className="fast-entry-note"><Clock3 size={16} /><span><strong>Freshness automation</strong> · This cake will be active immediately and sorted by best-before on the sale terminal.</span></div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button"><Plus size={17} /> Add & publish</button></div>
        </div>
      </form>
    </Modal>
  )
}

function CommandPalette({ open, query, setQuery, onClose, onNavigate, onAdd }: {
  open: boolean
  query: string
  setQuery: (value: string) => void
  onClose: () => void
  onNavigate: (page: PageId) => void
  onAdd: () => void
}) {
  const filtered = useMemo(() => commandItems.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(query.toLowerCase())), [query])
  if (!open) return null
  return (
    <div className="command-layer" role="dialog" aria-modal="true" aria-label="Global search">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close search" />
      <section className="command-card">
        <label><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and actions…" /><kbd>ESC</kbd></label>
        <div className="command-results">
          <span>Navigate</span>
          {filtered.map((item) => <button key={item.id} onClick={() => onNavigate(item.id)}><i>{item.icon}</i><span><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowRight size={16} /></button>)}
          {filtered.length === 0 && <div className="command-empty">No results for “{query}”</div>}
        </div>
        <div className="command-footer"><button onClick={onAdd}><Plus size={15} /> Add a fresh cake</button><span><kbd>↑↓</kbd> to navigate <kbd>↵</kbd> to select</span></div>
      </section>
    </div>
  )
}
