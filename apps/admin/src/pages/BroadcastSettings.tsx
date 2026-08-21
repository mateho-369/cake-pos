import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'
export default function BroadcastSettings({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const [message, setMessage] = useState('')
  const [count, setCount] = useState(0)
  const [history, setHistory] = useState<
    Array<{
      id: number
      message: string
      sentAt: string | null
      recipientCount: number
      successCount: number
      failureCount: number
    }>
  >([])
  const load = () =>
    apiRequest<typeof history>('/api/broadcasts')
      .then(setHistory)
      .catch(() => undefined)
  useEffect(() => {
    apiRequest<{ recipientCount: number }>('/api/broadcasts/preview')
      .then((v) => setCount(v.recipientCount))
      .catch(() => undefined)
    void load()
  }, [])
  const send = async () => {
    if (!message.trim()) return
    if (!window.confirm(`Send this announcement to ${count} customers?`)) return
    try {
      const result = await apiRequest<{ recipientCount: number }>(
        '/api/broadcasts',
        { method: 'POST', body: JSON.stringify({ message }) },
      )
      onToast(`Broadcast queued for ${result.recipientCount} customers`)
      setMessage('')
      void load()
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Broadcast failed')
    }
  }
  return (
    <>
      <div className="setting-section">
        <h3>Customer broadcast</h3>
        <p>Write Khmer and English together in one announcement.</p>
        <textarea
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Khmer announcement… English translation…"
        />
        <button type="button" className="primary-button" onClick={send}>
          Send to all customers
        </button>
      </div>
      <div className="setting-section">
        <h3>Broadcast history</h3>
        {history.map((b) => (
          <div key={b.id}>
            <strong>{b.sentAt || 'Queued'}</strong>
            <p>{b.message}</p>
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
