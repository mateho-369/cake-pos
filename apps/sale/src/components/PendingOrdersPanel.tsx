import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Banknote, Phone, ScanLine, X } from 'lucide-react'
import { apiRequest } from '../lib/api'
import { useTranslation } from '../lib/i18n'

type PendingOrder = {
  id: string
  pickupCode?: string | null
  isStale?: boolean
  createdAt: string
  status: string
  total: number
  detail: string[]
  customer?: { name: string; phone?: string } | null
}

type Props = {
  shiftOpen: boolean
  /** Perform the actual payment POST. */
  onPay: (
    orderId: string,
    method: 'Cash' | 'KHQR',
    usdReceivedCents: number,
  ) => Promise<void>
  /**
   * If a shift is open, run `resume` immediately; otherwise prompt to open a
   * shift and run `resume` once it is open.
   */
  onNeedShift: (resume: () => void) => void
  onToast: (message: string) => void
}

export default function PendingOrdersPanel({
  shiftOpen,
  onPay,
  onNeedShift,
  onToast,
}: Props) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<PendingOrder[]>([])
  const [paying, setPaying] = useState<PendingOrder | null>(null)
  const [method, setMethod] = useState<'Cash' | 'KHQR'>('Cash')
  const [received, setReceived] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiRequest<PendingOrder[]>('/api/orders/pending')
      .then(setPending)
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    load()
    const timer = window.setInterval(load, 15000)
    return () => window.clearInterval(timer)
  }, [load])

  const openPay = (order: PendingOrder) => {
    setPaying(order)
    setMethod('Cash')
    setReceived(order.total.toFixed(2))
  }

  const doPay = (order: PendingOrder, m: 'Cash' | 'KHQR', usdCents: number) => {
    setBusy(true)
    onPay(order.id, m, usdCents)
      .then(() => {
        setPaying(null)
        onToast(t('pending.paid', { id: order.pickupCode || order.id }))
        load()
      })
      .catch((reason) =>
        onToast(reason instanceof Error ? reason.message : 'Payment failed'),
      )
      .finally(() => setBusy(false))
  }

  const confirmPay = () => {
    if (!paying) return
    const usdCents =
      method === 'Cash' ? Math.round(Number(received || 0) * 100) : 0
    const order = paying
    // Gate on the shift: either pay now, or open a shift first and pay after.
    onNeedShift(() => doPay(order, method, usdCents))
  }

  if (!pending.length) return null
  return (
    <section className="pending-panel">
      <div className="pending-panel-head">
        <span>{t('pending.title')}</span>
        <em>{pending.length}</em>
      </div>
      <div className="pending-panel-list">
        {pending.map((order) => (
          <article
            key={order.id}
            className={`pending-card ${order.isStale ? 'stale' : ''}`}
          >
            <div className="pending-card-top">
              <strong className="pending-code">
                {order.pickupCode || order.id}
              </strong>
              {order.isStale && (
                <span className="pending-stale">
                  <AlertTriangle size={11} /> {t('pending.stale')}
                </span>
              )}
              <b>${order.total.toFixed(2)}</b>
            </div>
            <div className="pending-card-body">
              <strong>{order.customer?.name || t('pending.customer')}</strong>
              {order.customer?.phone && (
                <a
                  className="pending-phone"
                  href={`tel:${order.customer.phone}`}
                >
                  <Phone size={11} /> {order.customer.phone}
                </a>
              )}
              <small>{order.detail.join('; ')}</small>
            </div>
            <button
              className="pending-pay-button"
              disabled={busy}
              onClick={() => openPay(order)}
            >
              <Banknote size={15} /> {t('pending.takePayment')}
            </button>
          </article>
        ))}
      </div>
      {paying && (
        <div className="pending-pay-sheet">
          <div className="pending-pay-card">
            <header>
              <strong>
                {t('pending.takePayment')} — {paying.pickupCode || paying.id}
              </strong>
              <button onClick={() => setPaying(null)} aria-label="Close">
                <X size={16} />
              </button>
            </header>
            <div className="pending-pay-methods">
              <button
                className={method === 'Cash' ? 'active' : ''}
                onClick={() => setMethod('Cash')}
              >
                <Banknote size={14} /> {t('pending.cash')}
              </button>
              <button
                className={method === 'KHQR' ? 'active' : ''}
                onClick={() => setMethod('KHQR')}
              >
                <ScanLine size={14} /> {t('pending.khqr')}
              </button>
            </div>
            {method === 'Cash' ? (
              <label className="pending-pay-amount">
                <span>{t('pending.received')}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={received}
                  onChange={(event) => setReceived(event.target.value)}
                />
              </label>
            ) : (
              <p className="pending-pay-note">{t('pending.khqrNote')}</p>
            )}
            {!shiftOpen && (
              <p className="pending-pay-shift-note">{t('pending.shiftNote')}</p>
            )}
            <button
              className="pending-pay-confirm"
              disabled={busy || (method === 'Cash' && Number(received) <= 0)}
              onClick={confirmPay}
            >
              {t('pending.confirmPayment')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
