import { useMemo, useState, type CSSProperties } from 'react'
import { uploadImage } from '@cake-pos/uploads'
import {
  Archive,
  ChevronDown,
  Columns3,
  Edit3,
  MoreHorizontal,
  Plus,
  Search,
  Upload,
} from 'lucide-react'
import { type Product } from '../data'
import Modal from '../components/Modal'
import { translateCategory, useTranslation } from '../lib/i18n'
import { apiRequest } from '../lib/api'
import { useAdminData } from '../lib/data'
import ProductImportModal from '../components/ProductImportModal'

type ProductsPageProps = {
  onAdd: () => void
  onToast: (message: string) => void
}
export default function ProductsPage({ onAdd, onToast }: ProductsPageProps) {
  const { t } = useTranslation()
  const { products, categories, updateProduct, refresh } = useAdminData()
  const [importOpen, setImportOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState<Product | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [view, setView] = useState<'table' | 'grid'>('table')
  const filters = [
    { id: 'all', label: 'catalog.allProducts' },
    { id: 'active', label: 'common.active' },
    { id: 'risk', label: 'catalog.freshnessRisk' },
    { id: 'out', label: 'catalog.outOfStock' },
  ]
  const stockTotal = products.reduce((sum, product) => sum + product.stock, 0)
  const retailValue = products.reduce(
    (sum, product) => sum + product.stock * product.price,
    0,
  )
  const riskUnits = products.filter((product) =>
    ['1 day left', 'Expires today', 'Expired'].includes(product.status),
  )
  const riskValue = riskUnits.reduce(
    (sum, product) => sum + product.stock * product.price,
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
    const existingImages =
      product.images && product.images.length
        ? product.images
        : product.imageUrl
          ? [{ url: product.imageUrl, caption: '' }]
          : []
    setEditing({ ...product, images: existingImages })
  }

  const uploadProductPhoto = async (file?: File, slotIndex = -1) => {
    if (!file || !editing) return
    setUploadingPhoto(true)
    setPhotoError(null)
    try {
      const uploaded = await uploadImage(file, apiRequest)
      setEditing((current) => {
        if (!current) return current
        const images = current.images ? [...current.images] : []
        if (slotIndex >= 0 && slotIndex < images.length) {
          images[slotIndex] = {
            ...images[slotIndex],
            url: uploaded.publicUrl,
          }
        } else if (images.length < 5) {
          images.push({ url: uploaded.publicUrl, caption: '' })
        } else {
          images[images.length - 1] = {
            ...images[images.length - 1],
            url: uploaded.publicUrl,
          }
        }
        const next = {
          ...current,
          images,
          imageUrl: images[0]?.url || current.imageUrl,
        }
        return next
      })
    } catch (reason) {
      setPhotoError(
        reason instanceof Error ? reason.message : 'Photo upload failed',
      )
    } finally {
      setUploadingPhoto(false)
    }
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

  const addImageSlot = () =>
    setEditing((current) => {
      if (!current) return current
      const images = current.images ? [...current.images] : []
      if (images.length >= 5) return current
      images.push({ url: '', caption: '' })
      return { ...current, images }
    })

  const archiveEditing = async () => {
    if (!editing) return
    try {
      await updateProduct(editing.id, { active: false })
      setEditing(null)
      onToast(t('common.archived'))
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : 'Archive failed')
    }
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
    await updateProduct(editing.id, {
      name: String(form.get('name') || editing.name),
      category: String(form.get('category') || editing.category),
      price: Number(form.get('price') || editing.price),
      stock: Number(form.get('stock') || editing.stock),
      madeAt: String(form.get('madeAt') || editing.madeAt),
      bestBefore: String(form.get('bestBefore') || editing.bestBefore),
      imageUrl: images[0]?.url || editing.imageUrl || undefined,
      images,
      active: form.get('active') === 'on',
    })
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
          <strong className="coral-text">{riskUnits.length}</strong>
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
                    date: product.bestBefore.replace(', 2026', ''),
                  })}
                </small>
              </div>
              <div className="stock-cell">
                <strong>{product.stock}</strong>
                <span>{t('common.units')}</span>
              </div>
              <strong className="numeric">${product.price.toFixed(2)}</strong>
              <div>
                <strong>{t('catalog.sold', { count: product.sold })}</strong>
                <small className="block-note">${product.revenue}</small>
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
            <span>{t('catalog.showing', { shown: visible.length })}</span>
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
                <button
                  className="icon-button"
                  onClick={() => beginEdit(product)}
                  aria-label={`${t('common.edit')} ${product.name}`}
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
              <div className="catalog-card-copy">
                <span>{translateCategory(t, product.category)}</span>
                <h3>{product.name}</h3>
                <div>
                  <strong>${product.price}</strong>
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
                    <label
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
                    >
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploadingPhoto}
                        onChange={(event) => {
                          void uploadProductPhoto(
                            event.target.files?.[0],
                            index,
                          )
                          event.target.value = ''
                        }}
                      />
                      <span>
                        {uploadingPhoto ? '…' : image.url ? 'Replace' : '+'}
                      </span>
                    </label>
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
                    onClick={addImageSlot}
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
            <div className="form-grid two-columns">
              <label>
                <span>{t('catalog.productName')}</span>
                <input name="name" defaultValue={editing.name} required />
              </label>
              <label>
                <span>{t('catalog.category')}</span>
                <select name="category" defaultValue={editing.category}>
                  {categories.map((item) => (
                    <option key={item.name} value={item.name}>
                      {translateCategory(t, item.name)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </label>
              <label>
                <span>{t('catalog.priceUsd')}</span>
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  defaultValue={editing.price}
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
            <div className="modal-actions split-actions">
              <button
                type="button"
                className="danger-text-button"
                onClick={() => void archiveEditing()}
              >
                <Archive size={16} /> {t('catalog.archive')}
              </button>
              <span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditing(null)}
                >
                  {t('common.cancel')}
                </button>
                <button className="primary-button" disabled={uploadingPhoto}>
                  <Edit3 size={16} /> {t('catalog.saveChanges')}
                </button>
              </span>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
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
