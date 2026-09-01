import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Archive,
  ChevronDown,
  Columns3,
  Edit3,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  ShieldQuestion,
  Trash2,
  Upload,
} from 'lucide-react'
import { type Product } from '../data'
import Modal from '../components/Modal'
import ImageSourcePicker from '../components/ImageSourcePicker'
import { translateCategory, useTranslation } from '../lib/i18n'
import { apiRequest } from '../lib/api'
import { useAdminData } from '../lib/data'
import ProductImportModal from '../components/ProductImportModal'

// A missing/null price from a legacy or partial product row must never throw
// `toFixed is not a function` on the admin Products page.
const safeNumber = (value: number | null | undefined) =>
  Number.isFinite(value as number) ? (value as number) : 0
const usd = (value: number | null | undefined) =>
  `$${safeNumber(value).toFixed(2)}`

export const DEACTIVATION_REASONS = [
  { id: 'out_of_stock', key: 'reasons.outOfStock' },
  { id: 'discontinued', key: 'reasons.discontinued' },
  { id: 'quality', key: 'reasons.quality' },
  { id: 'seasonal_return', key: 'reasons.seasonalReturn' },
  { id: 'other', key: 'reasons.other' },
] as const

type ProductsPageProps = {
  onAdd: () => void
  onToast: (message: string) => void
  /** A product id coming from elsewhere (e.g. a report link): open its
      edit modal once the catalog has loaded. */
  editId?: number | null
  onEditConsumed?: () => void
}
export default function ProductsPage({
  onAdd,
  onToast,
  editId = null,
  onEditConsumed,
}: ProductsPageProps) {
  const { t } = useTranslation()
  const { products, categories, updateProduct, deleteProduct, refresh } =
    useAdminData()
  const [importOpen, setImportOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState<Product | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteConfirmProduct, setDeleteConfirmProduct] =
    useState<Product | null>(null)
  const [deleteInProgress, setDeleteInProgress] = useState(false)
  const [listDeleteError, setListDeleteError] = useState<string | null>(null)
  const [view, setView] = useState<'table' | 'grid'>('table')
  // Image picker target: {slotIndex} replaces an existing gallery slot, or
  // -1 appends a new one. Shared with the broadcast composer (item 6/12).
  const [pickerTarget, setPickerTarget] = useState<number | null>(null)
  // Reason prompt shown when an edit deactivates the product or zeroes its
  // stock manually — the API refuses those changes without a reason.
  const [reasonPrompt, setReasonPrompt] = useState<{
    pending: Record<string, unknown>
    action: 'deactivate' | 'stock-zero' | 'both'
  } | null>(null)
  const [reasonCode, setReasonCode] = useState<string>(
    DEACTIVATION_REASONS[0].id,
  )
  const [reasonNote, setReasonNote] = useState('')
  // Latest accountability reason recorded for the product being edited.
  const [lastReason, setLastReason] = useState<{
    action: string
    reasonCode: string
    reasonNote: string | null
    employee: string
    at: string
  } | null>(null)
  const [broadcastFor, setBroadcastFor] = useState<Product | null>(null)
  const [broadcastCaption, setBroadcastCaption] = useState('')
  const [broadcastSending, setBroadcastSending] = useState(false)
  const openBroadcastFor = (product: Product) => {
    setBroadcastCaption(`New: ${product.name} — ${usd(product.price)}`)
    setBroadcastFor(product)
  }
  const sendBroadcast = async () => {
    if (!broadcastFor) return
    setBroadcastSending(true)
    try {
      const result = await apiRequest<{
        recipientCount: number
        status: string
      }>('/api/broadcasts', {
        method: 'POST',
        body: JSON.stringify({
          caption: broadcastCaption,
          imageUrl:
            broadcastFor.images?.[0]?.url || broadcastFor.imageUrl || null,
        }),
      })
      onToast(t('catalog.broadcastQueued', { count: result.recipientCount }))
      setBroadcastFor(null)
      setBroadcastCaption('')
    } catch (reason) {
      onToast(
        reason instanceof Error ? reason.message : t('catalog.broadcastFailed'),
      )
    } finally {
      setBroadcastSending(false)
    }
  }
  const filters = [
    { id: 'all', label: 'catalog.allProducts' },
    { id: 'active', label: 'common.active' },
    { id: 'risk', label: 'catalog.freshnessRisk' },
    { id: 'out', label: 'catalog.outOfStock' },
  ]
  const stockTotal = products.reduce((sum, product) => sum + product.stock, 0)
  const retailValue = products.reduce(
    (sum, product) => sum + product.stock * safeNumber(product.price),
    0,
  )
  // Same freshness-risk definition as the Overview dashboard so both pages
  // always show the same number: near-expiry products, counted in UNITS.
  const riskProducts = products.filter((product) =>
    ['1 day left', 'Expires today'].includes(product.status),
  )
  const riskUnits = riskProducts.reduce(
    (sum, product) => sum + product.stock,
    0,
  )
  const riskValue = riskProducts.reduce(
    (sum, product) => sum + product.stock * safeNumber(product.price),
    0,
  )
  const soldTotal = products.reduce((sum, product) => sum + product.sold, 0)
  const sellThrough =
    soldTotal + stockTotal ? (soldTotal / (soldTotal + stockTotal)) * 100 : 0
  const visible = useMemo(
    () =>
      products.filter((product) => {
        const matchesQuery =
          `${product.name} ${translateCategory(t, product.category)}`
            .toLowerCase()
            .includes(query.toLowerCase())
        if (filter === 'active') return matchesQuery && product.active
        if (filter === 'risk')
          return (
            matchesQuery &&
            ['1 day left', 'Expires today', 'Expired'].includes(product.status)
          )
        if (filter === 'out') return matchesQuery && product.stock === 0
        return matchesQuery
      }),
    [query, filter],
  )
  const beginEdit = (product: Product) => {
    setPhotoError(null)
    setLastReason(null)
    const existingImages =
      product.images && product.images.length
        ? product.images
        : product.imageUrl
          ? [{ url: product.imageUrl, caption: '' }]
          : []
    setEditing({ ...product, images: existingImages })
    // Pull this product's accountability trail (deactivation / stock-zero
    // reasons) so the admin can review WHY it ever left the floor.
    apiRequest<
      Array<{
        action: string
        details: {
          reasonCode?: string
          reasonNote?: string | null
        }
        employee: string
        at: string
      }>
    >(`/api/reports/audit?productId=${product.id}`)
      .then((rows) => {
        const latest = rows[0]
        if (latest?.details?.reasonCode) {
          setLastReason({
            action: latest.action,
            reasonCode: latest.details.reasonCode,
            reasonNote: latest.details.reasonNote ?? null,
            employee: latest.employee,
            at: latest.at,
          })
        }
      })
      .catch(() => undefined)
  }

  // A product picked from a report (or anywhere else) opens its edit modal
  // as soon as the catalog has loaded, then hands the intent back.
  useEffect(() => {
    if (editId == null) return
    const product = products.find((item) => item.id === editId)
    if (!product) return
    beginEdit(product)
    onEditConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, products, onEditConsumed])

  const applyPickedImage = (url: string, slotIndex: number) => {
    setEditing((current) => {
      if (!current) return current
      const images = current.images ? [...current.images] : []
      if (slotIndex >= 0 && slotIndex < images.length) {
        images[slotIndex] = { ...images[slotIndex], url }
      } else if (images.length < 5) {
        images.push({ url, caption: '' })
      } else {
        images[images.length - 1] = { ...images[images.length - 1], url }
      }
      return {
        ...current,
        images,
        imageUrl: images[0]?.url || current.imageUrl,
      }
    })
  }

  const updateImage = (
    index: number,
    patch: { url?: string; caption?: string },
  ) =>
    setEditing((current) =>
      current
        ? {
            ...current,
            images: (current.images || []).map((image, i) =>
              i === index ? { ...image, ...patch } : image,
            ),
          }
        : current,
    )

  const removeImage = (index: number) =>
    setEditing((current) =>
      current
        ? {
            ...current,
            images: (current.images || []).filter((_, i) => i !== index),
          }
        : current,
    )

  const archiveEditing = () => {
    if (!editing) return
    // Archiving IS deactivating: it needs an accountability reason, which
    // the API enforces. The reason prompt then performs the archive.
    setReasonPrompt({ pending: { active: false }, action: 'deactivate' })
    setReasonCode(DEACTIVATION_REASONS[0].id)
    setReasonNote('')
  }

  const submitWithReason = async () => {
    if (!reasonPrompt || !editing) return
    const input = {
      ...reasonPrompt.pending,
      reasonCode,
      ...(reasonNote.trim() ? { reasonNote: reasonNote.trim() } : {}),
    } as Parameters<typeof updateProduct>[1]
    try {
      await updateProduct(editing.id, input)
      setReasonPrompt(null)
      setEditing(null)
      onToast(t('common.archived'))
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : 'Archive failed')
    }
  }

  // The backend counts order_items rows per product on the catalog index and
  // is the authority on deletability. When that count is missing (older
  // payloads) we fall back to letting the backend answer with its 422.
  const referencedByOrders = (product: Product) =>
    (product.orderItemReferences ?? 0) > 0

  const deleteEditing = async () => {
    if (!editing) return
    setDeleteError(null)
    try {
      await deleteProduct(editing.id)
      setEditing(null)
      onToast(t('catalog.deleted'))
    } catch (reason) {
      // The backend returns a 422 with a clear message when the product is
      // referenced by past orders; surface that in the form notice so the
      // user understands why delete is not available and what to do instead.
      setDeleteError(
        reason instanceof Error ? reason.message : t('catalog.deleteFailed'),
      )
    }
  }

  const openDeleteConfirm = (product: Product) => {
    setDeleteConfirmProduct(product)
    setListDeleteError(null)
  }

  const closeDeleteConfirm = () => {
    setDeleteConfirmProduct(null)
    setListDeleteError(null)
  }

  const executeDeleteFromList = async () => {
    if (!deleteConfirmProduct) return
    setDeleteInProgress(true)
    try {
      await deleteProduct(deleteConfirmProduct.id)
      setDeleteConfirmProduct(null)
      onToast(t('catalog.deleted'))
    } catch (reason) {
      // Show the explanation inside the dialog (covers the order-reference
      // 422) instead of a toast the user might miss.
      setListDeleteError(
        reason instanceof Error ? reason.message : t('catalog.deleteFailed'),
      )
      setDeleteInProgress(false)
      return
    }
    setDeleteInProgress(false)
  }

  const saveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    const form = new FormData(event.currentTarget)
    const images = (editing.images || [])
      .map((image) => ({
        url: image.url,
        caption: image.caption || '',
        sortOrder: (editing.images || []).indexOf(image),
      }))
      .filter((image) => Boolean(image.url))
    const input = {
      name: String(form.get('name') || editing.name),
      categoryId: Number(form.get('categoryId') || editing.categoryId || 0),
      price: Number(form.get('price') || (editing.price ?? 0)),
      stock: Number(form.get('stock') ?? editing.stock),
      madeAt: String(form.get('madeAt') || editing.madeAt),
      bestBefore: String(form.get('bestBefore') || editing.bestBefore),
      imageUrl: images[0]?.url || editing.imageUrl || undefined,
      images,
      active: form.get('active') === 'on',
      hideWhenOutOfStock: form.get('hideWhenOutOfStock') === 'on',
    }
    const deactivating = editing.active && !input.active
    const zeroing = editing.stock > 0 && input.stock === 0
    if (deactivating || zeroing) {
      // Manual deactivation / stock-zeroing needs an accountability reason
      // (the API rejects the change without one). Prompt first, then save.
      setReasonPrompt({
        pending: input,
        action:
          deactivating && zeroing
            ? 'both'
            : deactivating
              ? 'deactivate'
              : 'stock-zero',
      })
      setReasonCode(DEACTIVATION_REASONS[0].id)
      setReasonNote('')
      return
    }
    await updateProduct(editing.id, input)
    setEditing(null)
    onToast(t('catalog.saved'))
  }
  return (
    <div className="page-content">
      <section className="catalog-summary">
        <div>
          <span>{t('catalog.allProducts')}</span>
          <strong>{products.length}</strong>
          <small>
            {t('catalog.activeProducts', {
              count: products.filter((product) => product.active).length,
            })}
          </small>
        </div>
        <div>
          <span>{t('catalog.unitsOnHand')}</span>
          <strong>{stockTotal}</strong>
          <small>
            {t('catalog.retailValue', {
              value: retailValue.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              }),
            })}
          </small>
        </div>
        <div>
          <span>{t('catalog.freshnessRisk')}</span>
          <strong className="coral-text">
            {riskUnits} {t('common.units')}
          </strong>
          <small>
            {t('catalog.retailValue', {
              value: riskValue.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              }),
            })}
          </small>
        </div>
        <div>
          <span>{t('catalog.soldToday')}</span>
          <strong>{soldTotal}</strong>
          <small>
            {t('catalog.sellThroughPercent', {
              percent: Math.round(sellThrough),
            })}
          </small>
        </div>
      </section>
      <section className="page-toolbar catalog-toolbar">
        <div className="filter-row">
          <label className="inline-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('catalog.search')}
            />
          </label>
          <div className="filter-tabs">
            {filters.map((item) => (
              <button
                className={filter === item.id ? 'active' : ''}
                onClick={() => setFilter(item.id)}
                key={item.id}
              >
                {t(item.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-actions">
          <button
            className="icon-button"
            onClick={() => setView(view === 'table' ? 'grid' : 'table')}
            title={t('catalog.changeView')}
          >
            <Columns3 size={18} />
          </button>
          <button
            className="secondary-button"
            onClick={() => setImportOpen(true)}
          >
            <Upload size={16} /> Import Products
          </button>
          <button className="primary-button" onClick={onAdd}>
            <Plus size={17} /> {t('header.addCake')}
          </button>
        </div>
      </section>
      {view === 'table' ? (
        <section className="glass-panel catalog-table table-responsive">
          <div className="catalog-table-head catalog-row">
            <label>
              <input type="checkbox" /> {t('catalog.product')}
            </label>
            <span>{t('catalog.freshness')}</span>
            <span>{t('catalog.stock')}</span>
            <span>{t('catalog.price')}</span>
            <span>{t('catalog.today')}</span>
            <span>{t('catalog.status')}</span>
            <span />
            <span />
          </div>
          {visible.map((product) => (
            <div className="catalog-row" key={product.id}>
              <div className="catalog-product">
                <input type="checkbox" />
                <span
                  className="catalog-image"
                  style={productImageStyle(product)}
                />
                <div>
                  <strong>{product.name}</strong>
                  <small>
                    {translateCategory(t, product.category)} ·{' '}
                    {t('catalog.sku', {
                      id: String(product.id).padStart(3, '0'),
                    })}
                  </small>
                </div>
              </div>
              <div>
                <span
                  className={`freshness-badge ${statusClass(product.status)}`}
                >
                  {statusLabel(t, product.status)}
                </span>
                <small className="block-note">
                  {t('catalog.bestBefore', {
                    date: shortDate(product.bestBefore),
                  })}
                </small>
              </div>
              <div className="stock-cell">
                <strong>{product.stock}</strong>
                <span>{t('common.units')}</span>
              </div>
              <strong className="numeric">{usd(product.price)}</strong>
              <div>
                <strong>{t('catalog.sold', { count: product.sold })}</strong>
                <small className="block-note">{usd(product.revenue)}</small>
              </div>
              <span
                className={`status-badge ${product.active ? 'success' : 'neutral'}`}
              >
                <i />
                {product.active ? t('common.active') : t('common.archived')}
              </span>
              <button
                className="icon-button"
                onClick={() => beginEdit(product)}
                aria-label={`${t('common.edit')} ${product.name}`}
              >
                <MoreHorizontal size={18} />
              </button>
              <button
                className="icon-button"
                onClick={() => openDeleteConfirm(product)}
                aria-label={`${t('catalog.delete')} ${product.name}`}
                disabled={deleteInProgress}
                title={
                  referencedByOrders(product)
                    ? t('catalog.cantDelete')
                    : t('catalog.delete')
                }
                style={{ color: '#e53e3e' }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
          {visible.length === 0 && (
            <div className="empty-state">
              <Search size={24} />
              <strong>{t('catalog.noProducts')}</strong>
              <span>{t('catalog.trySearchFilter')}</span>
            </div>
          )}
          <div className="table-footer">
            <span>
              {t('catalog.showing', {
                shown: visible.length,
                total: products.length,
              })}
            </span>
          </div>
        </section>
      ) : (
        <section className="catalog-card-grid">
          {visible.map((product) => (
            <article className="glass-panel catalog-card" key={product.id}>
              <div
                className="catalog-card-image"
                style={productImageStyle(product)}
              >
                <span
                  className={`freshness-badge ${statusClass(product.status)}`}
                >
                  {statusLabel(t, product.status)}
                </span>
                <div className="card-actions">
                  <button
                    className="icon-button"
                    onClick={() => beginEdit(product)}
                    aria-label={`${t('common.edit')} ${product.name}`}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => openDeleteConfirm(product)}
                    aria-label={`${t('catalog.delete')} ${product.name}`}
                    disabled={deleteInProgress}
                    title={
                      referencedByOrders(product)
                        ? t('catalog.cantDelete')
                        : t('catalog.delete')
                    }
                    style={{ color: '#e53e3e' }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <div className="catalog-card-copy">
                <span>{translateCategory(t, product.category)}</span>
                <h3>{product.name}</h3>
                <div>
                  <strong>{usd(product.price)}</strong>
                  <span>
                    {product.stock} {t('common.units')}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
      <ProductImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        categories={categories}
        onImported={refresh}
        onToast={onToast}
      />
      {deleteConfirmProduct && (
        <Modal
          open={true}
          onClose={closeDeleteConfirm}
          eyebrow={t('catalog.catalogItem')}
          title={t('catalog.deleteConfirm')}
          size="small"
        >
          <div className="delete-confirm">
            <div className="delete-confirm-product">
              <strong>{deleteConfirmProduct.name}</strong>
              <small>
                {t('catalog.sku', {
                  id: String(deleteConfirmProduct.id).padStart(3, '0'),
                })}
              </small>
              <small>
                {t('catalog.sold', { count: deleteConfirmProduct.sold })}
              </small>
            </div>
            <p className="delete-confirm-message">
              {t('catalog.deleteConfirmMessage')}
            </p>
            {referencedByOrders(deleteConfirmProduct) && (
              <div className="form-notice warning" role="alert">
                {t('catalog.cantDelete')}
              </div>
            )}
            {listDeleteError && (
              <div className="form-notice warning" role="alert">
                {listDeleteError}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={deleteInProgress}
                onClick={closeDeleteConfirm}
              >
                {t('common.cancel')}
              </button>
              <button
                className="danger-button"
                disabled={
                  referencedByOrders(deleteConfirmProduct) || deleteInProgress
                }
                onClick={() => void executeDeleteFromList()}
              >
                {deleteInProgress ? '…' : <Trash2 size={16} />}{' '}
                {t('catalog.delete')}
              </button>
            </div>
          </div>
        </Modal>
      )}
      <Modal
        open={Boolean(broadcastFor)}
        onClose={() => {
          setBroadcastFor(null)
          setBroadcastCaption('')
        }}
        eyebrow={t('reports.broadcastFromProduct')}
        title={broadcastFor?.name || ''}
        size="small"
      >
        {broadcastFor && (
          <div className="modal-form broadcast-from-product">
            {(broadcastFor.images?.[0]?.url || broadcastFor.imageUrl) && (
              <img
                className="broadcast-thumb"
                src={
                  broadcastFor.images?.[0]?.url || broadcastFor.imageUrl || ''
                }
                alt={broadcastFor.name}
              />
            )}
            <label>
              <span>{t('reports.broadcastCaption')}</span>
              <textarea
                rows={3}
                value={broadcastCaption}
                onChange={(event) => setBroadcastCaption(event.target.value)}
              />
            </label>
            <p className="broadcast-hint">{t('catalog.broadcastHint')}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={broadcastSending}
                onClick={() => {
                  setBroadcastFor(null)
                  setBroadcastCaption('')
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={broadcastSending || !broadcastCaption.trim()}
                onClick={() => void sendBroadcast()}
              >
                <Send size={15} />
                {broadcastSending ? '…' : t('reports.sendBroadcast')}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        eyebrow={t('catalog.catalogItem')}
        title={t('catalog.editProduct')}
        size="medium"
      >
        {editing && (
          <form className="modal-form" onSubmit={saveEdit}>
            <div className="edit-product-summary">
              <div className="edit-product-gallery">
                {(editing.images || []).map((image, index) => (
                  <div className="edit-gallery-slot" key={index}>
                    <button
                      type="button"
                      className={`edit-gallery-photo ${image.url ? 'has-photo' : ''}`}
                      style={
                        image.url
                          ? {
                              backgroundImage: `url(${image.url})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }
                          : undefined
                      }
                      onClick={() => setPickerTarget(index)}
                      aria-label={image.url ? 'Replace image' : 'Add image'}
                    >
                      <span>{image.url ? 'Replace' : '+'}</span>
                    </button>
                    <input
                      className="edit-gallery-caption"
                      value={image.caption || ''}
                      placeholder="Caption / details"
                      onChange={(event) =>
                        updateImage(index, { caption: event.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="edit-gallery-remove"
                      onClick={() => removeImage(index)}
                      aria-label="Remove image"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {(editing.images || []).length < 5 && (
                  <button
                    type="button"
                    className="add-gallery-slot"
                    onClick={() => setPickerTarget(-1)}
                  >
                    <Plus size={17} /> Add image
                  </button>
                )}
              </div>
              <div>
                <span>
                  {t('catalog.sku', {
                    id: String(editing.id).padStart(3, '0'),
                  })}
                </span>
                <strong>{editing.name}</strong>
                <small>
                  {t('catalog.created', { date: editing.madeAt })} ·{' '}
                  {(editing.images || []).length}/5 images
                </small>
              </div>
            </div>
            {photoError && (
              <div className="form-notice warning">{photoError}</div>
            )}
            {deleteError && (
              <div className="form-notice warning">{deleteError}</div>
            )}
            {lastReason && (
              <div className="form-notice reason-history">
                <ShieldQuestion size={16} />
                <span>
                  {t('reasons.lastRecorded', {
                    action:
                      lastReason.action === 'product.deactivated'
                        ? t('reasons.deactivatedAction')
                        : t('reasons.zeroedAction'),
                    code: reasonLabel(t, lastReason.reasonCode),
                    employee: lastReason.employee,
                    date: new Date(lastReason.at).toLocaleDateString(),
                  })}
                  {lastReason.reasonNote ? ` — “${lastReason.reasonNote}”` : ''}
                </span>
              </div>
            )}
            <div className="form-grid two-columns">
              <label>
                <span>{t('catalog.productName')}</span>
                <input name="name" defaultValue={editing.name} required />
              </label>
              <label>
                <span>{t('catalog.category')}</span>
                <select
                  name="categoryId"
                  defaultValue={String(
                    editing.categoryId ??
                      categories.find((c) => c.name === editing.category)?.id ??
                      '',
                  )}
                >
                  {categorySelectGroups(categories).map((group) =>
                    group.parent ? (
                      <optgroup
                        key={`g-${group.parent.id}`}
                        label={translateCategory(t, group.parent.name)}
                      >
                        {group.children.map((item) => (
                          <option key={item.id} value={item.id}>
                            {translateCategory(t, item.name)}
                          </option>
                        ))}
                      </optgroup>
                    ) : (
                      group.children.map((item) => (
                        <option key={item.id} value={item.id}>
                          {translateCategory(t, item.name)}
                        </option>
                      ))
                    ),
                  )}
                </select>
                <ChevronDown size={15} />
              </label>
              <label>
                <span>{t('catalog.priceUsd')}</span>
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  defaultValue={editing.price ?? 0}
                  required
                />
              </label>
              <label>
                <span>{t('catalog.stockQuantity')}</span>
                <input
                  name="stock"
                  type="number"
                  defaultValue={editing.stock}
                  required
                />
              </label>
              <label>
                <span>{t('catalog.madeAt')}</span>
                <input
                  name="madeAt"
                  type="date"
                  defaultValue={toDateInput(editing.madeAt)}
                />
              </label>
              <label>
                <span>{t('catalog.bestBeforeLabel')}</span>
                <input
                  name="bestBefore"
                  type="date"
                  defaultValue={toDateInput(editing.bestBefore)}
                />
              </label>
            </div>
            <label className="toggle-field">
              <span>
                <strong>{t('catalog.availableForSale')}</strong>
                <small>{t('catalog.visibleSale')}</small>
              </span>
              <input
                name="active"
                type="checkbox"
                defaultChecked={editing.active}
              />
              <i />
            </label>
            <label className="toggle-field">
              <span>
                <strong>{t('catalog.hideWhenOutOfStock')}</strong>
                <small>{t('catalog.hideWhenOutOfStockHint')}</small>
              </span>
              <input
                name="hideWhenOutOfStock"
                type="checkbox"
                defaultChecked={Boolean(editing.hideWhenOutOfStock)}
              />
              <i />
            </label>
            <div className="modal-actions split-actions">
              <span className="edit-modal-left-actions">
                <button
                  type="button"
                  className="danger-text-button"
                  onClick={() => void deleteEditing()}
                >
                  <Trash2 size={16} /> {t('catalog.delete')}
                </button>
                <button
                  type="button"
                  className="danger-text-button"
                  onClick={() => void archiveEditing()}
                >
                  <Archive size={16} /> {t('catalog.archive')}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => openBroadcastFor(editing)}
                >
                  <Send size={15} /> {t('reports.broadcastFromProduct')}
                </button>
              </span>
              <span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditing(null)}
                >
                  {t('common.cancel')}
                </button>
                <button className="primary-button">
                  <Edit3 size={16} /> {t('catalog.saveChanges')}
                </button>
              </span>
            </div>
          </form>
        )}
      </Modal>
      <ImageSourcePicker
        open={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        onPick={(image) => {
          if (pickerTarget !== null) applyPickedImage(image.url, pickerTarget)
        }}
        onToast={onToast}
        products={products}
      />
      {reasonPrompt && editing && (
        <Modal
          open={true}
          onClose={() => setReasonPrompt(null)}
          eyebrow={t('catalog.accountability')}
          title={t('reasons.title')}
          size="small"
        >
          <form
            className="modal-form reason-form"
            onSubmit={(event) => {
              event.preventDefault()
              void submitWithReason()
            }}
          >
            <p className="reason-intro">
              {reasonPrompt.action === 'stock-zero'
                ? t('reasons.zeroIntro', { name: editing.name })
                : t('reasons.deactivateIntro', { name: editing.name })}
            </p>
            <div className="reason-options">
              {DEACTIVATION_REASONS.map((reason) => (
                <label key={reason.id} className="reason-option">
                  <input
                    type="radio"
                    name="reasonCode"
                    value={reason.id}
                    checked={reasonCode === reason.id}
                    onChange={() => setReasonCode(reason.id)}
                  />
                  <span>{t(reason.key)}</span>
                </label>
              ))}
            </div>
            {reasonCode === 'other' && (
              <label className="reason-note">
                <span>{t('reasons.noteLabel')}</span>
                <input
                  value={reasonNote}
                  onChange={(event) => setReasonNote(event.target.value)}
                  placeholder={t('reasons.notePlaceholder')}
                  maxLength={500}
                />
              </label>
            )}
            {reasonCode !== 'other' && (
              <label className="reason-note">
                <span>{t('reasons.noteOptional')}</span>
                <input
                  value={reasonNote}
                  onChange={(event) => setReasonNote(event.target.value)}
                  placeholder={t('reasons.notePlaceholder')}
                  maxLength={500}
                />
              </label>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setReasonPrompt(null)}
              >
                {t('common.cancel')}
              </button>
              <button className="primary-button">
                <ShieldQuestion size={16} /> {t('reasons.confirm')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
/**
 * Grouped options for the category <select>: top-level categories as loose
 * options, subcategories inside an <optgroup> named after their parent (one
 * level only — the API enforces that when saving).
 */
function categorySelectGroups(categories: ProductsPageCategory[]) {
  type Group = {
    parent: ProductsPageCategory | null
    children: ProductsPageCategory[]
  }
  const parents = categories.filter((item) => !item.parentId)
  const groups: Group[] = []
  for (const parent of parents) {
    const children = categories.filter((item) => item.parentId === parent.id)
    // The parent stays a normal option; its subcategories follow inside an
    // <optgroup> so the grouping is visible in the picker itself.
    groups.push({ parent: null, children: [parent] })
    if (children.length > 0) {
      groups.push({ parent, children })
    }
  }
  // Orphan subcategories (parent deactivated) still need to be selectable.
  const known = new Set(groups.flatMap((g) => g.children.map((c) => c.id)))
  for (const item of categories) {
    if (!known.has(item.id)) groups.push({ parent: null, children: [item] })
  }
  return groups
}

function reasonLabel(
  t: (key: string, variables?: Record<string, string | number>) => string,
  code: string,
) {
  return DEACTIVATION_REASONS.find((reason) => reason.id === code)
    ? t(DEACTIVATION_REASONS.find((reason) => reason.id === code)!.key)
    : code
}

type ProductsPageCategory = {
  id: number
  name: string
  parentId?: number | null
}

function productImageStyle(product: Product): CSSProperties {
  const primary = product.images?.[0]?.url || product.imageUrl
  return primary
    ? {
        backgroundImage: `url(${primary})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { backgroundPosition: product.imagePosition }
}

function toDateInput(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
function shortDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
  })
}
function statusClass(status: Product['status']) {
  return status === 'Fresh'
    ? 'fresh'
    : status === '1 day left'
      ? 'warning'
      : 'danger'
}
function statusLabel(
  t: (key: string, variables?: Record<string, string | number>) => string,
  status: string,
) {
  return status === 'Fresh'
    ? t('dashboard.freshStatus')
    : status === '1 day left'
      ? t('dashboard.oneDayLeft')
      : status === 'Expires today'
        ? t('dashboard.expiresToday')
        : t('catalog.expired')
}
