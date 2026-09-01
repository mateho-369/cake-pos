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
import ImageSourcePicker from './components/ImageSourcePicker'
import type { Category, PageId, Product } from './data'
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
  const {
    createProduct,
    createCategory,
    categories,
    products,
    defaultShelfLifeDays,
  } = useAdminData()
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
  // Cross-page intents: a sidebar Reports dropdown pick, and drill-through
  // jumps from report rows to the underlying record (product, order,
  // employee, customer) plus the settings section to open.
  const [reportIntent, setReportIntent] = useState<{ tab?: string } | null>(
    null,
  )
  const [reportIntentNonce, setReportIntentNonce] = useState(0)
  const [editProductId, setEditProductId] = useState<number | null>(null)
  const [editEmployeeId, setEditEmployeeId] = useState<number | null>(null)
  const [selectCustomerId, setSelectCustomerId] = useState<number | null>(null)
  const [settingsSection, setSettingsSection] = useState('business')
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
  const openReportTab = (tabId: string) => {
    setReportIntent({ tab: tabId })
    setReportIntentNonce((nonce) => nonce + 1)
    navigate('reports')
  }
  const openProductDetail = (productId: number) => {
    setEditProductId(productId)
    navigate('products')
  }
  const openBusinessSettings = () => {
    setSettingsSection('business')
    navigate('settings')
  }
  // QuickZoom-style drill-throughs: a report row opens its real record.
  const openEmployeeDetail = (employeeId: number) => {
    setEditEmployeeId(employeeId)
    navigate('employees')
  }
  const openCustomerDetail = (customerId: number) => {
    setSelectCustomerId(customerId)
    navigate('customers')
  }
  const openShiftDetail = () => {
    navigate('shifts')
  }
  const openCategoryDetail = () => {
    navigate('categories')
  }
  const addProduct = async (
    event: React.FormEvent<HTMLFormElement>,
    categoryId: number | null,
    madeToday: boolean,
  ) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await createProduct({
      name: String(form.get('name') || ''),
      categoryId: categoryId ?? undefined,
      price: Number(form.get('price') || 0),
      stock: Number(form.get('stock') || 0),
      madeAt: String(
        form.get('madeAt') || new Date().toISOString().slice(0, 10),
      ),
      bestBefore: String(
        form.get('bestBefore') ||
          new Date(
            Date.now() +
              Math.max(
                1,
                madeToday ? defaultShelfLifeDays : defaultShelfLifeDays - 1,
              ) *
                86_400_000,
          )
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
        onOpenReportTab={openReportTab}
        onEditLocation={openBusinessSettings}
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
          <ProductsPage
            onAdd={() => setAddOpen(true)}
            onToast={setToast}
            editId={editProductId}
            onEditConsumed={() => setEditProductId(null)}
          />
        )}
        {page === 'orders' && (
          <OrdersPage
            selectedId={selectedOrder}
            onSelect={setSelectedOrder}
            onToast={setToast}
          />
        )}
        {page === 'customers' && (
          <CustomersPage
            selectId={selectCustomerId}
            onSelectConsumed={() => setSelectCustomerId(null)}
          />
        )}
        {page === 'freshness' && <FreshnessPage onToast={setToast} />}
        {page === 'categories' && <CategoriesPage onToast={setToast} />}
        {page === 'employees' && (
          <EmployeesPage
            onToast={setToast}
            editId={editEmployeeId}
            onEditConsumed={() => setEditEmployeeId(null)}
          />
        )}
        {page === 'shifts' && <ShiftsPage onToast={setToast} />}
        {page === 'reports' && (
          <ReportsPage
            onToast={setToast}
            initialTab={reportIntent?.tab}
            intentNonce={reportIntentNonce}
            onIntentConsumed={() => setReportIntent(null)}
            onOpenProduct={openProductDetail}
            onOpenOrder={openOrder}
            onOpenEmployee={openEmployeeDetail}
            onOpenCustomer={openCustomerDetail}
            onOpenShift={openShiftDetail}
            onOpenCategory={openCategoryDetail}
          />
        )}
        {page === 'settings' && (
          <SettingsPage onToast={setToast} initialSection={settingsSection} />
        )}
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
        onCreateCategory={createCategory}
        shelfLifeDays={defaultShelfLifeDays}
        photoPreview={photoPreview}
        setPhotoPreview={setPhotoPreview}
        products={products}
        onToast={setToast}
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
  onCreateCategory,
  shelfLifeDays,
  photoPreview,
  setPhotoPreview,
  products,
  onToast,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (
    event: React.FormEvent<HTMLFormElement>,
    categoryId: number | null,
    madeToday: boolean,
  ) => void
  categories: Category[]
  onCreateCategory: (input: { name: string }) => Promise<Category>
  shelfLifeDays: number
  photoPreview: string | null
  setPhotoPreview: (value: string | null) => void
  products: import('./data').Product[]
  onToast: (message: string) => void
}) {
  const { t } = useTranslation()
  const [categoryId, setCategoryId] = useState<number | null>(
    categories[0]?.id ?? null,
  )
  const [madeToday, setMadeToday] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Inline category creation, used when there is nothing to pick from. The
  // cake name / price / photo live outside this state, so creating a
  // category here never discards what was already typed.
  const [newCategory, setNewCategory] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [categoryError, setCategoryError] = useState('')
  const createCategory = async () => {
    const name = newCategory.trim()
    if (!name) return
    setCreatingCategory(true)
    setCategoryError('')
    try {
      const created = await onCreateCategory({ name })
      setCategoryId(created.id)
      setNewCategory('')
      onToast(t('catalog.categoryCreated', { name: created.name }))
    } catch (reason) {
      setCategoryError(
        reason instanceof Error ? reason.message : String(reason),
      )
    } finally {
      setCreatingCategory(false)
    }
  }
  // Keep the selected category valid as the admin manages categories while
  // the modal is open (the list can change underneath us).
  useEffect(() => {
    if (categoryId && !categories.some((item) => item.id === categoryId)) {
      setCategoryId(categories[0]?.id ?? null)
    }
  }, [categories, categoryId])
  const bestBeforeDate = new Date(
    Date.now() +
      Math.max(1, madeToday ? shelfLifeDays : shelfLifeDays - 1) * 86_400_000,
  )
  const bestBeforeLabel = bestBeforeDate.toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
  })
  // Category chips grouped by hierarchy: parents first, their subcategories
  // visually nested right after them (one level — the API enforces that).
  const grouped = useMemo(() => {
    const parents = categories.filter((item) => !item.parentId)
    const rows: Array<{ category: Category; child: boolean }> = []
    for (const parent of parents) {
      rows.push({ category: parent, child: false })
      for (const child of categories.filter(
        (item) => item.parentId === parent.id,
      )) {
        rows.push({ category: child, child: true })
      }
    }
    for (const orphan of categories.filter(
      (item) => item.parentId && !parents.some((p) => p.id === item.parentId),
    )) {
      rows.push({ category: orphan, child: true })
    }
    return rows
  }, [categories])
  const onPicked = (image: { url: string }) => setPhotoPreview(image.url)
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
        onSubmit={(event) => onSubmit(event, categoryId, madeToday)}
      >
        <label
          className={`photo-upload ${photoPreview ? 'has-photo' : ''}`}
          style={
            photoPreview
              ? { backgroundImage: `url(${photoPreview})` }
              : undefined
          }
        >
          <span
            className="photo-upload-hit"
            aria-hidden="true"
            onClick={() => setPickerOpen(true)}
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
        <ImageSourcePicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={onPicked}
          onToast={onToast}
          products={products}
        />
        <div className="quick-fields">
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
            {grouped.length === 0 && (
              <div className="category-empty">
                <strong>{t('catalog.noCategoriesYet')}</strong>
                <span>{t('catalog.noCategoriesHint')}</span>
              </div>
            )}
            {grouped.length > 0 && (
              <div className="category-chips">
                {grouped.map(({ category, child }) => (
                  <button
                    type="button"
                    key={category.id}
                    className={`${categoryId === category.id ? 'active' : ''} ${child ? 'subcategory-chip' : ''}`}
                    onClick={() => setCategoryId(category.id)}
                  >
                    {child ? '↳ ' : ''}
                    {translateCategory(t, category.name)}
                  </button>
                ))}
              </div>
            )}
            {grouped.length === 0 && (
              <div className="category-new-row">
                <input
                  value={newCategory}
                  maxLength={60}
                  placeholder={t('catalog.newCategoryPlaceholder')}
                  onChange={(event) => setNewCategory(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void createCategory()
                    }
                  }}
                />
                <button
                  type="button"
                  className="secondary-button category-new-button"
                  disabled={creatingCategory || !newCategory.trim()}
                  onClick={() => void createCategory()}
                >
                  <Plus size={14} />
                  {creatingCategory
                    ? t('common.loading')
                    : t('catalog.addCategory')}
                </button>
              </div>
            )}
            {categoryError && <p className="login-error">{categoryError}</p>}
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
                    ? t('sale.bestBeforeAuto', { date: bestBeforeLabel })
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
            <button className="primary-button">
              <Plus size={17} /> {t('sale.addPublish')}
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
