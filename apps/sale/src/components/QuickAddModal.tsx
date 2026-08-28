import { useEffect, useState } from 'react'
import {
  Camera,
  Check,
  Clock3,
  ImagePlus,
  Plus,
  Sparkles,
  Upload,
} from 'lucide-react'
import { uploadImage } from '@cake-pos/uploads'
import { type Product } from '../data'
import { apiRequest } from '../lib/api'
import { useSaleData } from '../lib/data'
import Modal from './Modal'
import { useTranslation } from '../lib/i18n'
export default function QuickAddModal({
  open,
  onClose,
  onAdd,
  shelfLifeDays,
}: {
  open: boolean
  onClose: () => void
  onAdd: (product: Product) => void
  shelfLifeDays: number
}) {
  const { t } = useTranslation()
  // categoryList is the real active category list (GET /api/categories).
  // `categories` is deliberately NOT used here: it is filtered down to
  // categories that already have a product, which made a perfectly good
  // category unselectable until someone created a product in it.
  const { categoryList, refresh } = useSaleData()
  const [photo, setPhoto] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  // No default: the cashier picks. Defaulting to a hardcoded name submitted
  // "unknown category: <name>" for every store that did not use it.
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [pendingReview, setPendingReview] = useState(false)
  const [nearDuplicate, setNearDuplicate] = useState<string | null>(null)
  const [madeToday, setMadeToday] = useState(true)
  const categoryKeys: Record<string, string> = {
    Signature: 'sale.signatureCategory',
    'Whole cakes': 'sale.wholeCakes',
    'Mini cakes': 'sale.miniCakes',
    Slices: 'sale.slices',
    Cupcakes: 'sale.cupcakes',
    Drinks: 'sale.drinks',
    'Party Hats': 'catalog.partyHats',
    'Party Decor': 'catalog.partyDecor',
    'Party Décor': 'catalog.partyDecor',
    'Party Supplies': 'catalog.partySupplies',
    Toys: 'catalog.toys',
    'Toys & Games': 'catalog.toys',
  }
  const categoryLabel = (item: string) => t(categoryKeys[item] || item)
  // Every category in the list is selectable, including one with no product
  // in it yet — that is the whole point of adding a category before the
  // first cake goes into it. (GET /api/categories already returns only
  // active categories; a category row's own `active` field is the ACTIVE
  // PRODUCT count, not a flag, so it must never be used to filter here.)
  const activeCategories = categoryList

  /** Case-insensitive guard against "Cofee" when "Coffee" already exists. */
  const checkForNearDuplicate = (value: string) => {
    const wanted = value.trim().toLowerCase()
    if (!wanted) {
      setNearDuplicate(null)
      return
    }
    const exact = activeCategories.find(
      (item) => item.name.toLowerCase() === wanted,
    )
    if (exact) {
      setCategoryId(exact.id)
      setCategoryName(exact.name)
      setNearDuplicate(null)
      setNewCategory('')
      return
    }
    const close = activeCategories.find(
      (item) =>
        item.name.toLowerCase().includes(wanted) ||
        wanted.includes(item.name.toLowerCase()),
    )
    setNearDuplicate(close ? close.name : null)
  }

  const createCategory = async () => {
    const wanted = newCategory.trim()
    if (!wanted || creatingCategory) return
    setCreatingCategory(true)
    setCategoryError(null)
    try {
      const created = await apiRequest<{
        id: number
        name: string
        pendingReview?: boolean
      }>('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: wanted }),
      })
      setCategoryId(created.id)
      setCategoryName(created.name)
      setPendingReview(Boolean(created.pendingReview))
      setNewCategory('')
      setNearDuplicate(null)
      void refresh()
    } catch (reason) {
      setCategoryError(
        reason instanceof Error ? reason.message : 'Could not add category',
      )
    } finally {
      setCreatingCategory(false)
    }
  }
  useEffect(() => {
    if (!open) return
    setPhoto(null)
    setUploadingPhoto(false)
    setUploadError(null)
    setName('')
    setPrice('')
    setCategoryId(null)
    setCategoryName('')
    setNewCategory('')
    setCategoryError(null)
    setPendingReview(false)
    setNearDuplicate(null)
    setMadeToday(true)
  }, [open])
  const selectPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingPhoto(true)
    setUploadError(null)
    try {
      const uploaded = await uploadImage(file, apiRequest)
      setPhoto(uploaded.publicUrl)
    } catch (reason) {
      setPhoto(null)
      setUploadError(
        reason instanceof Error ? reason.message : 'Photo upload failed',
      )
    } finally {
      setUploadingPhoto(false)
      event.target.value = ''
    }
  }
  const effectiveShelfLife = Math.max(
    1,
    madeToday ? shelfLifeDays : shelfLifeDays - 1,
  )
  const bestBefore = new Date(Date.now() + effectiveShelfLife * 86_400_000)
  const bestBeforeLabel = bestBefore.toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
  })
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    onAdd({
      id: Date.now(),
      name,
      category: categoryName,
      categoryId: categoryId ?? undefined,
      price: Number(price),
      stock: 1,
      imagePosition: '0% 0%',
      imageUrl: photo || undefined,
      freshness: 'fresh',
      bestBefore: bestBefore.toISOString().slice(0, 10),
    })
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={t('sale.quickEntry')}
      title={t('sale.addFreshCake')}
      size="large"
      sheet
    >
      <form className="quick-add-layout" onSubmit={submit}>
        <label
          className={`photo-capture ${photo ? 'has-photo' : ''}`}
          style={photo ? { backgroundImage: `url(${photo})` } : undefined}
        >
          <input
            type="file"
            accept="image/*"
            disabled={uploadingPhoto}
            onChange={selectPhoto}
          />
          {!photo ? (
            <>
              <span>
                <Camera size={29} />
              </span>
              <strong>
                {uploadingPhoto ? 'Uploading photo…' : t('sale.takePhoto')}
              </strong>
              <small>
                {uploadingPhoto
                  ? 'Keep this window open while the image uploads.'
                  : t('sale.photoFirst')}
              </small>
              <em>
                <Upload size={15} /> {t('sale.choosePhoto')}
              </em>
            </>
          ) : (
            <em className="replace-photo">
              <ImagePlus size={15} /> {t('sale.replacePhoto')}
            </em>
          )}
        </label>
        <div className="quick-add-fields">
          {uploadError && <div className="login-error">{uploadError}</div>}
          <div className="quick-add-intro">
            <Sparkles size={17} />
            <span>
              <strong>{t('sale.onlyEssentials')}</strong>
              <small>{t('sale.editLater')}</small>
            </span>
          </div>
          <div className="field-grid">
            <label>
              <span>{t('sale.cakeName')}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('sale.namePlaceholder')}
                required
              />
            </label>
            <label>
              <span>{t('catalog.price')}</span>
              <div className="currency-input">
                <span>$</span>
                <input
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="0.00"
                  min="0"
                  type="number"
                  step="0.01"
                  required
                />
              </div>
            </label>
          </div>
          <label className="category-field">
            <span>{t('sale.category')}</span>
            {activeCategories.length === 0 ? (
              <div className="category-empty">
                <strong>{t('sale.noCategoriesYet')}</strong>
                <span>{t('sale.noCategoriesHint')}</span>
              </div>
            ) : (
              <div className="quick-category-chips">
                {activeCategories.map((item) => (
                  <button
                    type="button"
                    className={categoryId === item.id ? 'active' : ''}
                    onClick={() => {
                      setCategoryId(item.id)
                      setCategoryName(item.name)
                      setPendingReview(false)
                    }}
                    key={item.id}
                  >
                    {categoryId === item.id && <Check size={12} />}
                    {categoryLabel(item.name)}
                  </button>
                ))}
              </div>
            )}
            <div className="category-new-row">
              <input
                value={newCategory}
                maxLength={60}
                placeholder={t('sale.newCategoryPlaceholder')}
                onChange={(event) => {
                  setNewCategory(event.target.value)
                  checkForNearDuplicate(event.target.value)
                }}
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
                disabled={creatingCategory || newCategory.trim().length === 0}
                onClick={() => void createCategory()}
              >
                <Plus size={14} />
                {creatingCategory ? t('common.loading') : t('sale.addCategory')}
              </button>
            </div>
            {nearDuplicate && (
              <p className="category-hint">
                {t('sale.didYouMean', { name: nearDuplicate })}
              </p>
            )}
            {categoryError && <p className="login-error">{categoryError}</p>}
            {categoryId && !categoryError && (
              <p className="category-hint">{t('sale.categoryChosen')}</p>
            )}
            {pendingReview && (
              <p className="category-hint pending-review-note">
                {t('sale.categoryPendingReview')}
              </p>
            )}
          </label>
          <label className="made-today-row">
            <span>
              <Clock3 size={18} />
              <span>
                <strong>{t('sale.madeToday')}</strong>
                <small>
                  {t('sale.bestBeforeAuto', { date: bestBeforeLabel })}
                </small>
              </span>
            </span>
            <input
              type="checkbox"
              checked={madeToday}
              onChange={(event) => setMadeToday(event.target.checked)}
            />
            <i />
          </label>
          <div className="best-before-note">
            <span>{t('sale.freshAutomationUpper')}</span>
            <strong>{madeToday ? t('sale.threeDay') : t('sale.twoDay')}</strong>
            <small>{t('sale.prioritizedFresh')}</small>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              className="primary-button"
              disabled={uploadingPhoto || !categoryId}
              title={!categoryId ? t('sale.pickCategoryFirst') : undefined}
            >
              <Plus size={17} />{' '}
              {uploadingPhoto ? 'Uploading…' : t('sale.addPublish')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
