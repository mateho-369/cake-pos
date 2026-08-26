import { useEffect, useMemo, useState } from 'react'
import { uploadImage } from '@cake-pos/uploads'
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
import MediaPage from './pages/MediaPage'
import CustomersPage from './pages/CustomersPage'
import LoginPage from './pages/LoginPage'
import { useStaffAuth } from './auth/StaffAuthContext'
import { translateCategory, useTranslation } from './lib/i18n'
import { apiRequest } from './lib/api'
import { useAdminData } from './lib/data'

const commandItems: {
  id: PageId
  label: string
  detail: string
  icon: React.ReactNode
}[] = [
  {
    id: 'overview',
    label: 'nav.overview',
    detail: 'command.performance',
    icon: <LayoutDashboard size={18} />,
  },
  {
    id: 'orders',
    label: 'nav.orders',
    detail: 'command.transactions',
    icon: <ReceiptText size={18} />,
  },
  {
    id: 'customers',
    label: 'nav.customers',
    detail: 'command.customers',
    icon: <Users size={18} />,
  },
  {
    id: 'products',
    label: 'nav.products',
    detail: 'command.products',
    icon: <CakeSlice size={18} />,
  },
  {
    id: 'freshness',
    label: 'nav.freshness',
    detail: 'command.freshness',
    icon: <PackageCheck size={18} />,
  },
  {
    id: 'categories',
    label: 'nav.categories',
    detail: 'command.categories',
    icon: <Tags size={18} />,
  },
  {
    id: 'employees',
    label: 'nav.employees',
    detail: 'command.employees',
    icon: <Users size={18} />,
  },
  {
    id: 'shifts',
    label: 'nav.shifts',
    detail: 'command.shifts',
    icon: <Clock3 size={18} />,
  },
  {
    id: 'reports',
    label: 'nav.reports',
    detail: 'command.reports',
    icon: <CircleDollarSign size={18} />,
  },
  {
    id: 'settings',
    label: 'nav.settings',
    detail: 'command.settings',
    icon: <Settings size={18} />,
  },
]
export default function App() {
  const { token } = useStaffAuth()
  const { t } = useTranslation()
  const { createProduct, categories } = useAdminData()
  const [page, setPage] = useState<PageId>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
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
        setProfileOpen(false)
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
    setProfileOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const openOrder = (id: string) => {
    setSelectedOrder(id)
    navigate('orders')
  }
  const addProduct = async (
    event: React.FormEvent<HTMLFormElement>,
    category: string,
    madeToday: boolean,
  ) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await createProduct({
      name: String(form.get('name') || ''),
      category,
      price: Number(form.get('price') || 0),
      stock: Number(form.get('stock') || 0),
      madeAt: String(
        form.get('madeAt') || new Date().toISOString().slice(0, 10),
      ),
      bestBefore: String(
        form.get('bestBefore') ||
          new Date(Date.now() + (madeToday ? 3 : 2) * 86_400_000)
            .toISOString()
            .slice(0, 10),
      ),
      imageUrl: photoPreview || undefined,
    })
    setAddOpen(false)
    setPhotoPreview(null)
    setToast(t('app.cakePublished'))
  }
  if (!token) return <LoginPage />
  return (
    <div className={`app-shell ${sidebarCollapsed ? 'app-collapsed' : ''}`}>
      <Sidebar
        page={page}
        onNavigate={navigate}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <main className="main-shell">
        <Header
          page={page}
          onOpenMenu={() => setSidebarOpen(true)}
          onAdd={() => setAddOpen(true)}
          onSearch={() => setCommandOpen(true)}
          onNotifications={() => setNotificationsOpen(!notificationsOpen)}
          notificationOpen={notificationsOpen}
          profileOpen={profileOpen}
          onToggleProfile={() => setProfileOpen(!profileOpen)}
          onCloseProfile={() => setProfileOpen(false)}
          onOpenSettings={() => navigate('settings')}
        />
        {page === 'overview' && (
          <Dashboard
            onNavigate={navigate}
            onOrder={openOrder}
            onToast={setToast}
          />
        )}
        {page === 'products' && (
          <ProductsPage onAdd={() => setAddOpen(true)} onToast={setToast} />
        )}
        {page === 'orders' && (
          <OrdersPage
            selectedId={selectedOrder}
            onSelect={setSelectedOrder}
            onToast={setToast}
          />
        )}
        {page === 'customers' && <CustomersPage />}
        {page === 'freshness' && <FreshnessPage onToast={setToast} />}
        {page === 'categories' && <CategoriesPage onToast={setToast} />}
        {page === 'employees' && <EmployeesPage onToast={setToast} />}
        {page === 'shifts' && <ShiftsPage onToast={setToast} />}
        {page === 'reports' && <ReportsPage onToast={setToast} />}
        {page === 'settings' && <SettingsPage onToast={setToast} />}
        {page === 'media' && <MediaPage onToast={setToast} />}
      </main>
      <AddCakeModal
        open={addOpen}
        onClose={() => {
          setAddOpen(false)
          setPhotoPreview(null)
        }}
        onSubmit={addProduct}
        categories={categories}
        photoPreview={photoPreview}
        setPhotoPreview={setPhotoPreview}
      />
      <CommandPalette
        open={commandOpen}
        query={commandQuery}
        setQuery={setCommandQuery}
        onClose={() => setCommandOpen(false)}
        onNavigate={navigate}
        onAdd={() => {
          setCommandOpen(false)
          setAddOpen(true)
        }}
      />
      {toast && (
        <div className="toast-message">
          <span>
            <Check size={15} />
          </span>
          {toast}
          <button onClick={() => setToast(null)} aria-label={t('common.close')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
function AddCakeModal({
  open,
  onClose,
  onSubmit,
  categories,
  photoPreview,
  setPhotoPreview,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (
    event: React.FormEvent<HTMLFormElement>,
    category: string,
    madeToday: boolean,
  ) => void
  categories: Array<{ name: string }>
  photoPreview: string | null
  setPhotoPreview: (value: string | null) => void
}) {
  const { t } = useTranslation()
  const [category, setCategory] = useState(categories[0]?.name || 'Signature')
  const [madeToday, setMadeToday] = useState(true)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const onPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    setUploadError(null)
    try {
      const uploaded = await uploadImage(file, apiRequest)
      setPhotoPreview(uploaded.publicUrl)
    } catch (reason) {
      setPhotoPreview(null)
      setUploadError(
        reason instanceof Error ? reason.message : 'Photo upload failed',
      )
    } finally {
      setUploadingPhoto(false)
      event.target.value = ''
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={t('sale.quickEntry')}
      title={t('sale.addFreshCake')}
      size="large"
    >
      <form
        className="add-cake-form"
        onSubmit={(event) => onSubmit(event, category, madeToday)}
      >
        <label
          className={`photo-upload ${photoPreview ? 'has-photo' : ''}`}
          style={
            photoPreview
              ? { backgroundImage: `url(${photoPreview})` }
              : undefined
          }
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={uploadingPhoto}
            onChange={onPhoto}
          />
          {!photoPreview && (
            <>
              <span className="photo-upload-icon">
                <Camera size={25} />
              </span>
              <strong>{t('sale.takePhoto')}</strong>
              <small>{t('sale.photoHint')}</small>
              <em>
                <Upload size={15} /> {t('sale.choosePhoto')}
              </em>
            </>
          )}
          {photoPreview && (
            <span className="replace-photo">
              <ImagePlus size={16} /> {t('common.replace')}
            </span>
          )}
        </label>
        <div className="quick-fields">
          {uploadError && (
            <div className="form-notice warning">{uploadError}</div>
          )}
          <div className="form-grid two-columns">
            <label>
              <span>{t('sale.name')}</span>
              <input
                name="name"
                autoFocus={!photoPreview}
                placeholder={t('sale.namePlaceholder')}
                required
              />
            </label>
            <label>
              <span>{t('catalog.price')}</span>
              <div className="currency-input">
                <span>$</span>
                <input
                  name="price"
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  required
                />
              </div>
            </label>
          </div>
          <label>
            <span>{t('catalog.category')}</span>
            <div className="category-chips">
              {categories.map((item) => (
                <button
                  type="button"
                  key={item.name}
                  className={category === item.name ? 'active' : ''}
                  onClick={() => setCategory(item.name)}
                >
                  {translateCategory(t, item.name)}
                </button>
              ))}
            </div>
          </label>
          <div className="quick-secondary-fields">
            <label>
              <span>{t('sale.startingStock')}</span>
              <input
                name="stock"
                type="number"
                min="0"
                defaultValue="1"
                required
              />
            </label>
            <label className="made-today-toggle">
              <span>
                <strong>{t('sale.madeToday')}</strong>
                <small>
                  {madeToday
                    ? t('sale.bestBeforeAuto')
                    : t('sale.chooseProduction')}
                </small>
              </span>
              <input
                type="checkbox"
                checked={madeToday}
                onChange={(event) => setMadeToday(event.target.checked)}
              />
              <i />
            </label>
          </div>
          {!madeToday && (
            <div className="form-grid two-columns compact-date-fields">
              <label>
                <span>{t('catalog.madeAt')}</span>
                <input name="madeAt" type="date" defaultValue="2026-08-20" />
              </label>
              <label>
                <span>{t('catalog.bestBeforeLabel')}</span>
                <input
                  name="bestBefore"
                  type="date"
                  defaultValue="2026-08-23"
                />
              </label>
            </div>
          )}
          <div className="fast-entry-note">
            <Clock3 size={16} />
            <span>
              <strong>{t('sale.freshAutomation')}</strong> ·{' '}
              {t('sale.freshAutomationText')}
            </span>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button className="primary-button" disabled={uploadingPhoto}>
              <Plus size={17} />{' '}
              {uploadingPhoto ? 'Uploading…' : t('sale.addPublish')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
function CommandPalette({
  open,
  query,
  setQuery,
  onClose,
  onNavigate,
  onAdd,
}: {
  open: boolean
  query: string
  setQuery: (value: string) => void
  onClose: () => void
  onNavigate: (page: PageId) => void
  onAdd: () => void
}) {
  const { t } = useTranslation()
  const filtered = useMemo(
    () =>
      commandItems.filter((item) =>
        `${t(item.label)} ${t(item.detail)}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, t],
  )
  if (!open) return null
  return (
    <div
      className="command-layer"
      role="dialog"
      aria-modal="true"
      aria-label={t('command.globalSearch')}
    >
      <button
        className="modal-backdrop"
        onClick={onClose}
        aria-label={t('modal.closeDialog')}
      />
      <section className="command-card">
        <label>
          <Search size={20} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('command.searchPages')}
          />
          <kbd>ESC</kbd>
        </label>
        <div className="command-results">
          <span>{t('command.navigate')}</span>
          {filtered.map((item) => (
            <button key={item.id} onClick={() => onNavigate(item.id)}>
              <i>{item.icon}</i>
              <span>
                <strong>{t(item.label)}</strong>
                <small>{t(item.detail)}</small>
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="command-empty">
              {t('command.noResults', { query })}
            </div>
          )}
        </div>
        <div className="command-footer">
          <button onClick={onAdd}>
            <Plus size={15} /> {t('command.addFresh')}
          </button>
          <span>
            <kbd>↑↓</kbd> {t('command.navigateKeys')} <kbd>↵</kbd>{' '}
            {t('command.select')}
          </span>
        </div>
      </section>
    </div>
  )
}
