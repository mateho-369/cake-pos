import { useEffect, useMemo, useState } from 'react'
import { uploadImage } from '@cake-pos/uploads'
import {
  Camera,
  ImagePlus,
  Library,
  Package,
  Search,
  Upload,
} from 'lucide-react'
import Modal from './Modal'
import { apiRequest } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import type { Product } from '../data'

// A product row with a missing/legacy null price must never throw
// `toFixed is not a function` while picking a photo. The catalog API is
// expected to send a numeric price, but an old/partial payload should render
// as $0.00 instead of crashing the Products page.
const usd = (value: number | null | undefined) =>
  `$${(Number.isFinite(value as number) ? (value as number) : 0).toFixed(2)}`

/**
 * Shared image chooser used wherever the admin attaches a photo to something
 * — the broadcast composer AND the product form (new or existing). One
 * component, three sources:
 *
 *   Upload new      → camera/library picker via the device's native sheet
 *   From a product  → reuse a photo already listed for sale
 *   From media      → reuse anything previously uploaded (media library)
 *
 * Note: the file input deliberately has NO `capture` attribute, so mobile
 * browsers show the native "Camera / Photo Library / Files" chooser instead
 * of force-opening the camera.
 */
export type PickedImage = {
  url: string
  caption?: string
  source: 'upload' | 'product' | 'library'
  product?: { id: number; name: string; price?: number | null }
}

type TabId = 'upload' | 'product' | 'library'

type MediaObject = {
  key: string
  url: string
  size: number
  lastModified: number
  status: 'in_use' | 'inactive_product' | 'orphaned'
  usedBy: string[]
}

export default function ImageSourcePicker({
  open,
  onClose,
  onPick,
  onToast,
  title,
  products,
}: {
  open: boolean
  onClose: () => void
  onPick: (image: PickedImage) => void
  onToast: (message: string) => void
  title?: string
  products?: Product[]
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabId>('upload')
  const [catalog, setCatalog] = useState<Product[] | null>(products ?? null)
  const [media, setMedia] = useState<MediaObject[] | null>(null)
  const [query, setQuery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The product list can be passed in (admin data context) or fetched once.
  useEffect(() => {
    if (!open || catalog || products) return
    apiRequest<Product[]>('/api/products')
      .then(setCatalog)
      .catch(() => setCatalog([]))
  }, [open, catalog, products])

  // Media library is only fetched when its tab is actually opened.
  useEffect(() => {
    if (!open || tab !== 'library' || media) return
    apiRequest<{ objects: MediaObject[] }>('/api/storage/media')
      .then((value) => setMedia(value.objects))
      .catch((reason) => {
        setError(
          reason instanceof Error ? reason.message : t('picker.mediaFailed'),
        )
        setMedia([])
      })
  }, [open, tab, media, t])

  useEffect(() => {
    if (open) return
    setTab('upload')
    setQuery('')
    setError(null)
  }, [open])

  const productResults = useMemo(() => {
    const source = catalog ?? []
    if (!query.trim()) return source
    return source.filter((product) =>
      `${product.name} ${product.category}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
  }, [catalog, query])

  const upload = async (file?: File) => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const uploaded = await uploadImage(file, apiRequest)
      onPick({ url: uploaded.publicUrl, source: 'upload' })
      onClose()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('picker.uploadFailed'),
      )
    } finally {
      setUploading(false)
    }
  }

  const pickProduct = (product: Product) => {
    const url = product.images?.[0]?.url || product.imageUrl
    if (!url) {
      setError(t('picker.noPhoto', { name: product.name }))
      return
    }
    onPick({
      url,
      caption: `New: ${product.name} — ${usd(product.price)}`,
      source: 'product',
      product: {
        id: product.id,
        name: product.name,
        price: product.price,
      },
    })
    onClose()
  }

  const tabs: Array<{ id: TabId; icon: React.ReactNode; label: string }> = [
    { id: 'upload', icon: <Upload size={15} />, label: t('picker.uploadNew') },
    { id: 'product', icon: <Package size={15} />, label: t('picker.fromProduct') },
    { id: 'library', icon: <Library size={15} />, label: t('picker.fromLibrary') },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={t('picker.eyebrow')}
      title={title || t('picker.title')}
      size="medium"
    >
      <div className="image-picker">
        <div className="segmented-control image-picker-tabs" role="tablist">
          {tabs.map((item) => (
            <button
              type="button"
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? 'active' : ''}
              onClick={() => setTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        {error && <div className="form-notice warning">{error}</div>}
        {tab === 'upload' && (
          <label className={`image-picker-dropzone ${uploading ? 'busy' : ''}`}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={(event) => {
                void upload(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            <span className="image-picker-dropzone-icon">
              {uploading ? <ImagePlus size={26} /> : <Camera size={26} />}
            </span>
            <strong>
              {uploading ? t('picker.uploading') : t('picker.chooseImage')}
            </strong>
            <small>{t('picker.uploadHint')}</small>
          </label>
        )}
        {tab === 'product' && (
          <div className="image-picker-pane">
            <label className="inline-search image-picker-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('picker.searchProducts')}
              />
            </label>
            <div className="image-picker-grid">
              {productResults.map((product) => {
                const url = product.images?.[0]?.url || product.imageUrl
                return (
                  <button
                    type="button"
                    key={product.id}
                    className="image-picker-tile"
                    onClick={() => pickProduct(product)}
                    style={
                      url
                        ? {
                            backgroundImage: `url(${url})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }
                        : undefined
                    }
                    title={product.name}
                  >
                    {!url && <span>{product.name.slice(0, 2)}</span>}
                    <em>
                      {product.name}
                      <small>{usd(product.price)}</small>
                    </em>
                  </button>
                )
              })}
              {catalog && productResults.length === 0 && (
                <div className="image-picker-empty">{t('picker.noProducts')}</div>
              )}
              {!catalog && <div className="image-picker-empty">…</div>}
            </div>
          </div>
        )}
        {tab === 'library' && (
          <div className="image-picker-pane">
            <div className="image-picker-grid">
              {(media ?? []).map((object) => (
                <button
                  type="button"
                  key={object.key}
                  className="image-picker-tile"
                  onClick={() => {
                    onPick({ url: object.url, source: 'library' })
                    onClose()
                  }}
                  style={{
                    backgroundImage: `url(${object.url})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                  title={object.usedBy.join(', ') || object.key}
                >
                  <em className={`library-status ${object.status}`}>
                    {object.status === 'in_use'
                      ? t('media.inUse')
                      : object.status === 'inactive_product'
                        ? t('media.inactiveProduct')
                        : t('media.orphaned')}
                  </em>
                </button>
              ))}
              {media && media.length === 0 && (
                <div className="image-picker-empty">{t('picker.noMedia')}</div>
              )}
              {!media && <div className="image-picker-empty">…</div>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
