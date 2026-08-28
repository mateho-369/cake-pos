import { useCallback, useEffect, useState } from 'react'
import { ImagePlus, Save, Send, Sparkles } from 'lucide-react'
import { apiRequest } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import ImageSourcePicker from '../components/ImageSourcePicker'
import type { Product } from '../data'

type Template = { id: number; name: string; imageUrl: string; caption: string }
type History = {
  id: number
  caption: string
  imageUrl?: string | null
  sentAt: string | null
  recipientCount: number
  successCount: number
  failureCount: number
}

/**
 * Customer broadcast composer. The image comes from the SAME source picker
 * the product form uses (upload new / from a product / from the media
 * library), and picking a product prefills the caption with its name/price.
 */
export default function BroadcastSettings({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const { t } = useTranslation()
  const [caption, setCaption] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageSource, setImageSource] = useState('')
  const [count, setCount] = useState(0)
  const [products, setProducts] = useState<Product[]>([])
  const [template, setTemplate] = useState('new_arrival')
  const [history, setHistory] = useState<History[]>([])
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateName, setTemplateName] = useState('')
  const loadHistory = useCallback(
    () => apiRequest<History[]>('/api/broadcasts').then(setHistory),
    [],
  )
  useEffect(() => {
    apiRequest<{ recipientCount: number }>('/api/broadcasts/preview').then(
      (v) => setCount(v.recipientCount),
    )
    apiRequest<Product[]>('/api/products').then(setProducts)
    void loadHistory()
    apiRequest<Template[]>('/api/broadcast-templates').then(setTemplates)
  }, [loadHistory])
  const generate = async (id: string) => {
    if (!id) return
    try {
      setBusy(true)
      const r = await apiRequest<{ imageUrl: string }>(
        '/api/broadcasts/poster',
        {
          method: 'POST',
          body: JSON.stringify({
            productId: Number(id),
            template,
            headline: caption || undefined,
          }),
        },
      )
      setImageUrl(r.imageUrl)
      setImageSource(t('picker.poster'))
      onToast(t('broadcast.posterGenerated'))
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('broadcast.posterFailed'))
    } finally {
      setBusy(false)
    }
  }
  const loadTemplate = (id: string) => {
    const picked = templates.find((x) => x.id === Number(id))
    if (picked) {
      setImageUrl(picked.imageUrl)
      setImageSource(t('picker.template'))
      setCaption(picked.caption)
    }
  }
  const saveTemplate = async () => {
    if (!templateName.trim() || !imageUrl || !caption.trim())
      return onToast(t('broadcast.needNamePhotoCaption'))
    try {
      const saved = await apiRequest<Template>('/api/broadcast-templates', {
        method: 'POST',
        body: JSON.stringify({ name: templateName, imageUrl, caption }),
      })
      setTemplates([saved, ...templates])
      setTemplateName('')
      onToast(t('broadcast.templateSaved'))
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('broadcast.templateFailed'))
    }
  }
  const renameTemplate = async (item: Template) => {
    const name = window.prompt(t('broadcast.templateNamePrompt'), item.name)
    if (!name || name === item.name) return
    const updated = await apiRequest<Template>(
      `/api/broadcast-templates/${item.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name,
          imageUrl: item.imageUrl,
          caption: item.caption,
        }),
      },
    )
    setTemplates(templates.map((x) => (x.id === item.id ? updated : x)))
  }
  const deleteTemplate = async (id: number) => {
    if (!window.confirm(t('broadcast.confirmDeleteTemplate'))) return
    await apiRequest(`/api/broadcast-templates/${id}`, { method: 'DELETE' })
    setTemplates(templates.filter((x) => x.id !== id))
  }
  const send = async () => {
    if (!caption.trim() || !imageUrl)
      return onToast(t('broadcast.needPhotoCaption'))
    if (
      !window.confirm(
        t('broadcast.confirmSend', { count: count.toLocaleString() }),
      )
    )
      return
    try {
      const r = await apiRequest<{ recipientCount: number }>(
        '/api/broadcasts',
        { method: 'POST', body: JSON.stringify({ imageUrl, caption }) },
      )
      onToast(t('broadcast.queued', { count: r.recipientCount }))
      setCaption('')
      setImageUrl('')
      setImageSource('')
      await loadHistory()
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('broadcast.failed'))
    }
  }
  return (
    <>
      <div className="setting-section">
        <h3>{t('broadcast.title')}</h3>
        <div className="broadcast-form">
          <div className="broadcast-form-fields">
            <label>
              <span>{t('broadcast.loadTemplate')}</span>
              <select defaultValue="" onChange={(e) => loadTemplate(e.target.value)}>
                <option value="">{t('broadcast.startNew')}</option>
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="broadcast-photo-field">
              <span>{t('broadcast.photo')}</span>
              <button
                type="button"
                className={`broadcast-photo-button secondary-button ${imageUrl ? 'has-image' : ''}`}
                style={
                  imageUrl
                    ? {
                        backgroundImage: `url(${imageUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : undefined
                }
                onClick={() => setPickerOpen(true)}
              >
                {imageUrl ? (
                  <span className="broadcast-photo-change">
                    <ImagePlus size={15} /> {t('common.replace')}
                    {imageSource ? ` · ${imageSource}` : ''}
                  </span>
                ) : (
                  <>
                    <ImagePlus size={19} />
                    <span>{t('broadcast.choosePhoto')}</span>
                    <small>{t('broadcast.photoHint')}</small>
                  </>
                )}
              </button>
            </label>
            <label>
              <span>{t('broadcast.caption')}</span>
              <textarea
                rows={5}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t('broadcast.captionPlaceholder')}
              />
            </label>
            <div className="broadcast-poster-row">
              <label>
                <span>{t('broadcast.posterShortcut')}</span>
                <select onChange={(e) => void generate(e.target.value)} disabled={busy}>
                  <option value="">{t('broadcast.useChosenPhoto')}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('broadcast.posterStyle')}</span>
                <select value={template} onChange={(e) => setTemplate(e.target.value)}>
                  <option value="new_arrival">{t('broadcast.newArrival')}</option>
                  <option value="selling_fast">{t('broadcast.sellingFast')}</option>
                  <option value="seasonal">{t('broadcast.seasonal')}</option>
                </select>
              </label>
            </div>
            {imageUrl && (
              <div className="broadcast-preview">
                <img src={imageUrl} alt={t('broadcast.previewAlt')} />
                <p>{caption || t('broadcast.noCaptionYet')}</p>
                {/* Static mock of the Telegram shop button — preview only. */}
                <span className="broadcast-preview-shop-button" aria-hidden="true">
                  🛒 {t('broadcast.openShopButton')}
                </span>
              </div>
            )}
            <div className="broadcast-actions">
              <label className="broadcast-template-name">
                <span>{t('broadcast.templateName')}</span>
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={t('broadcast.templateNamePlaceholder')}
                />
              </label>
              <button
                type="button"
                className="secondary-button"
                onClick={saveTemplate}
              >
                <Save size={15} /> {t('broadcast.saveAsTemplate')}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={send}
                disabled={!imageUrl || !caption.trim()}
              >
                <Send size={15} /> {t('broadcast.sendToAll', { count })}
              </button>
            </div>
          </div>
        </div>
      </div>
      <ImageSourcePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(image) => {
          setImageUrl(image.url)
          setImageSource(
            image.source === 'product'
              ? t('picker.fromProductSource', {
                  name: image.product?.name ?? '',
                })
              : image.source === 'library'
                ? t('picker.fromLibrary')
                : t('picker.uploadNew'),
          )
          // Picking a product photo prefills the caption (name + price) as a
          // shortcut, but never overwrites caption text the admin typed.
          if (image.source === 'product' && image.caption && !caption.trim()) {
            setCaption(image.caption)
          }
        }}
        onToast={onToast}
        title={t('picker.titleBroadcast')}
        products={products}
      />
      <div className="setting-section">
        <h3>{t('broadcast.history')}</h3>
        <div className="broadcast-history-list">
          {history.map((b) => (
            <div className="broadcast-history-row" key={b.id}>
              {b.imageUrl && <img src={b.imageUrl} alt="" />}
              <div>
                <strong>{b.sentAt || t('broadcast.queuedStatus')}</strong>
                <p>{b.caption}</p>
                <small>
                  {t('broadcast.deliveredStats', {
                    success: b.successCount,
                    total: b.recipientCount,
                    failed: b.failureCount,
                  })}
                </small>
              </div>
            </div>
          ))}
          {history.length === 0 && (
            <p className="broadcast-empty">{t('broadcast.noHistory')}</p>
          )}
        </div>
      </div>
      <div className="setting-section">
        <h3>{t('broadcast.savedTemplates')}</h3>
        <div className="broadcast-template-list">
          {templates.map((item) => (
            <div className="broadcast-template-row" key={item.id}>
              <img src={item.imageUrl} alt="" />
              <span>{item.name}</span>
              <button type="button" className="text-button" onClick={() => renameTemplate(item)}>
                {t('common.edit')}
              </button>
              <button
                type="button"
                className="danger-text-button"
                onClick={() => void deleteTemplate(item.id)}
              >
                {t('catalog.delete')}
              </button>
            </div>
          ))}
          {templates.length === 0 && (
            <p className="broadcast-empty">
              <Sparkles size={14} /> {t('broadcast.noTemplates')}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
