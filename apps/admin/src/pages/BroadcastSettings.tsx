import { useEffect, useState } from 'react'
import { uploadImage } from '@cake-pos/uploads'
import { apiRequest } from '../lib/api'
type Product = {
  id: number
  name: string
  price: number
  imageUrl?: string | null
}
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
  useEffect(() => {
    apiRequest<{ recipientCount: number }>('/api/broadcasts/preview').then(
      (v) => setCount(v.recipientCount),
    )
    apiRequest<Product[]>('/api/products').then(setProducts)
    apiRequest<History[]>('/api/broadcasts').then(setHistory)
  }, [])
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
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Broadcast failed')
    }
  }
  return (
    <>
      <div className="setting-section">
        <h3>Customer broadcast</h3>
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
            <button type="button">🛒 Open Shop / បើកហាង</button>
          </div>
        )}
        <button type="button" className="primary-button" onClick={send}>
          Send to all customers
        </button>
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
    </>
  )
}
