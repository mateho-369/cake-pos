import { useCallback, useEffect, useState } from 'react'
import { uploadImage } from '@cake-pos/uploads'
import { apiRequest } from '../lib/api'
type Product = {
  id: number
  name: string
  price: number
  imageUrl?: string | null
}
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
export default function BroadcastSettings({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const [caption, setCaption] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [count, setCount] = useState(0)
  const [products, setProducts] = useState<Product[]>([])
  const [template, setTemplate] = useState('new_arrival')
  const [history, setHistory] = useState<History[]>([])
  const [busy, setBusy] = useState(false)
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
  const photo = async (file?: File) => {
    if (!file) return
    try {
      setImageUrl((await uploadImage(file, apiRequest)).publicUrl)
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Upload failed')
    }
  }
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
      onToast('Poster generated')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Poster generation failed')
    } finally {
      setBusy(false)
    }
  }
  const loadTemplate = (id: string) => {
    const t = templates.find((x) => x.id === Number(id))
    if (t) {
      setImageUrl(t.imageUrl)
      setCaption(t.caption)
    }
  }
  const saveTemplate = async () => {
    if (!templateName.trim() || !imageUrl || !caption.trim())
      return onToast('Add a name, photo, and caption first')
    try {
      const t = await apiRequest<Template>('/api/broadcast-templates', {
        method: 'POST',
        body: JSON.stringify({ name: templateName, imageUrl, caption }),
      })
      setTemplates([t, ...templates])
      setTemplateName('')
      onToast('Template saved')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not save template')
    }
  }
  const renameTemplate = async (t: Template) => {
    const name = window.prompt('Template name', t.name)
    if (!name || name === t.name) return
    const updated = await apiRequest<Template>(
      `/api/broadcast-templates/${t.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name,
          imageUrl: t.imageUrl,
          caption: t.caption,
        }),
      },
    )
    setTemplates(templates.map((x) => (x.id === t.id ? updated : x)))
  }
  const deleteTemplate = async (id: number) => {
    if (!window.confirm('Delete this template?')) return
    await apiRequest(`/api/broadcast-templates/${id}`, { method: 'DELETE' })
    setTemplates(templates.filter((x) => x.id !== id))
  }
  const send = async () => {
    if (!caption.trim() || !imageUrl)
      return onToast('Add a photo and caption first')
    if (!window.confirm(`Send this announcement to ${count} customers?`)) return
    try {
      const r = await apiRequest<{ recipientCount: number }>(
        '/api/broadcasts',
        { method: 'POST', body: JSON.stringify({ imageUrl, caption }) },
      )
      onToast(`Broadcast queued for ${r.recipientCount} customers`)
      setCaption('')
      setImageUrl('')
      // Refresh the history list so the new broadcast appears immediately —
      // no manual reload needed.
      await loadHistory()
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Broadcast failed')
    }
  }
  return (
    <>
      <div className="setting-section">
        <h3>Customer broadcast</h3>
        <label>
          Load from template{' '}
          <select
            defaultValue=""
            onChange={(e) => loadTemplate(e.target.value)}
          >
            <option value="">Start a new broadcast</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <p>Upload your own photo and write any Khmer and/or English caption.</p>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => void photo(e.target.files?.[0])}
        />
        <textarea
          rows={5}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Announcement caption…"
        />
        <div>
          <label>
            Optional product shortcut{' '}
            <select
              onChange={(e) => void generate(e.target.value)}
              disabled={busy}
            >
              <option value="">Use uploaded photo</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            <option value="new_arrival">New Arrival</option>
            <option value="selling_fast">Selling Fast</option>
            <option value="seasonal">Seasonal / Holiday</option>
          </select>
        </div>
        {imageUrl && (
          <div
            style={{
              maxWidth: 420,
              margin: '16px 0',
              background: '#fff0f6',
              padding: 12,
              borderRadius: 20,
            }}
          >
            <img
              src={imageUrl}
              alt="Broadcast preview"
              style={{ width: '100%', borderRadius: 14 }}
            />
            <p>{caption}</p>
            {/* Static mock of the Telegram shop button — preview only. */}
            <span
              aria-hidden="true"
              style={{
                display: 'block',
                padding: '8px 12px',
                borderRadius: 10,
                background: '#f3dbe7',
                color: '#8d3a63',
                fontWeight: 700,
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              🛒 Open Shop / បើកហាង
            </span>
          </div>
        )}
        <div>
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Template name"
          />
          <button type="button" onClick={saveTemplate}>
            Save as template
          </button>
          <button type="button" className="primary-button" onClick={send}>
            Send to all customers
          </button>
        </div>
      </div>
      <div className="setting-section">
        <h3>Broadcast history</h3>
        {history.map((b) => (
          <div key={b.id}>
            <strong>{b.sentAt || 'Queued'}</strong>
            <p>{b.caption}</p>
            <small>
              {b.successCount}/{b.recipientCount} delivered · {b.failureCount}{' '}
              failed
            </small>
          </div>
        ))}
      </div>
      <div className="setting-section">
        <h3>Saved templates</h3>
        {templates.map((t) => (
          <div
            key={t.id}
            style={{ display: 'flex', gap: 12, alignItems: 'center' }}
          >
            <img
              src={t.imageUrl}
              alt=""
              width={56}
              height={40}
              style={{ objectFit: 'cover', borderRadius: 8 }}
            />
            <span>{t.name}</span>
            <button type="button" onClick={() => renameTemplate(t)}>
              Rename
            </button>
            <button type="button" onClick={() => void deleteTemplate(t.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
