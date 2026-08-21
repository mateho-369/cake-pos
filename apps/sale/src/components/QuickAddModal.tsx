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
}: {
  open: boolean
  onClose: () => void
  onAdd: (product: Product) => void
}) {
  const { t } = useTranslation()
  const { categories } = useSaleData()
  const [photo, setPhoto] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('Signature')
  const [madeToday, setMadeToday] = useState(true)
  const categoryKeys: Record<string, string> = {
    Signature: 'sale.signatureCategory',
    'Whole cakes': 'sale.wholeCakes',
    'Mini cakes': 'sale.miniCakes',
    Slices: 'sale.slices',
    Cupcakes: 'sale.cupcakes',
  }
  useEffect(() => {
    if (!open) return
    setPhoto(null)
    setUploadingPhoto(false)
    setUploadError(null)
    setName('')
    setPrice('')
    setCategory('Signature')
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
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    onAdd({
      id: Date.now(),
      name,
      category,
      price: Number(price),
      stock: 1,
      imagePosition: '0% 0%',
      imageUrl: photo || undefined,
      freshness: 'fresh',
      bestBefore: new Date(Date.now() + (madeToday ? 3 : 2) * 86_400_000)
        .toISOString()
        .slice(0, 10),
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
            capture="environment"
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
            <div className="quick-category-chips">
              {categories
                .filter((item) => !['All', 'Drinks'].includes(item))
                .map((item) => (
                  <button
                    type="button"
                    className={category === item ? 'active' : ''}
                    onClick={() => setCategory(item)}
                    key={item}
                  >
                    {category === item && <Check size={12} />}
                    {t(categoryKeys[item] || 'sale.signatureCategory')}
                  </button>
                ))}
            </div>
          </label>
          <label className="made-today-row">
            <span>
              <Clock3 size={18} />
              <span>
                <strong>{t('sale.madeToday')}</strong>
                <small>
                  {madeToday
                    ? t('sale.bestBeforeAuto2')
                    : t('sale.bestBefore22')}
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
