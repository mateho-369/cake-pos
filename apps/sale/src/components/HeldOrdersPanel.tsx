import { useCallback, useState } from 'react'
import {
  Banknote,
  PauseCircle,
  RotateCcw,
  ScanLine,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import { useTranslation } from '../lib/i18n'
import type { HeldOrder } from '../data'
// A null/omitted total on a legacy payload must never throw in the held list.
const safeNumber = (value: number | null | undefined) =>
  Number.isFinite(value as number) ? (value as number) : 0
const usd = (value: number | null | undefined) =>
  `$${safeNumber(value).toFixed(2)}`

type Props = {
  held: HeldOrder[]
  busy: boolean
  /** Opened from the header toolbar even when there are no held orders yet. */
  open?: boolean
  rate: number
  /** Put a held order's lines back into the cart (the hold stays until paid). */
  onResume: (order: HeldOrder) => void
  onPay: (
    order: HeldOrder,
    method: 'Cash' | 'KHQR',
    tender: { usdReceivedCents: number; khrReceived: number },
  ) => void
  onVoid: (order: HeldOrder) => void
}

/**
 * Held ("parked") orders — a customer ordered and left without paying, or
 * asked to collect and pay later. Several can be held at once; the panel is a
 * queue, oldest first. A hold leaves the list the moment it is paid (either
 * directly from here, or by checking out a cart that resumed it).
 */
export default function HeldOrdersPanel({
  held,
  busy,
  open = false,
  onResume,
  onPay,
  onVoid,
}: Props) {
  const { t } = useTranslation()
  const [paying, setPaying] = useState<HeldOrder | null>(null)
  const [method, setMethod] = useState<'Cash' | 'KHQR'>('Cash')
  const [received, setReceived] = useState('')
  const [receivedKhr, setReceivedKhr] = useState('')

  const openPay = (order: HeldOrder) => {
    setPaying(order)
    setMethod('Cash')
    setReceived(safeNumber(order.total).toFixed(2))
    setReceivedKhr('')
  }
  const closePay = useCallback(() => setPaying(null), [])

  if (!held.length && !paying && !open) return null
  return (
    <section className="held-panel" id="held-orders">
      <div className="held-panel-head">
        <span>
          <PauseCircle size={13} /> {t('hold.title')}
        </span>
        <em>{held.length}</em>
      </div>
      {held.length === 0 ? (
        <p className="held-panel-empty">{t('hold.empty')}</p>
      ) : held.length > 1 ? (
        <p className="held-panel-hint">{t('hold.manyHeld')}</p>
      ) : null}
      {held.length > 0 && (
        <div className="held-panel-list">
          {held.map((order) => (
          <article className="held-card" key={order.id}>
            <div className="held-card-top">
              <strong className="held-code">
                {order.holdLabel || order.id}
              </strong>
              {order.holdLabel && <small className="held-id">{order.id}</small>}
              <b>{usd(order.total)}</b>
            </div>
            <div className="held-card-body">
              {order.lineItems?.some((line) => line.note) ? (
                // An accepted Telegram order keeps the customer's per-line
                // notes ("Happy Birthday John"): show them line by line so
                // nothing is lost between Accept and pickup.
                <ul className="held-items">
                  {order.lineItems.map((line, index) => (
                    <li key={`${line.productId ?? 'x'}-${index}`}>
                      <small>
                        {line.description} × {line.quantity}
                      </small>
                      {line.note && (
                        <span
                          className="held-item-note"
                          title={t('hold.itemNote')}
                        >
                          <StickyNote size={11} /> {line.note}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <small>{order.detail.join('; ')}</small>
              )}
              <span className="held-meta">
                {order.time} · {t('hold.itemCount', { count: order.items })}
              </span>
            </div>
            <div className="held-card-actions">
              <button
                className="held-resume"
                disabled={busy}
                onClick={() => onResume(order)}
              >
                <RotateCcw size={14} /> {t('hold.resume')}
              </button>
              <button
                className="held-pay"
                disabled={busy}
                onClick={() => openPay(order)}
              >
                <Banknote size={14} /> {t('hold.payNow')}
              </button>
              <button
                className="held-void"
                disabled={busy}
                aria-label={t('hold.void')}
                onClick={() => onVoid(order)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </article>
          ))}
        </div>
      )}
      {paying && (
        <div className="held-pay-sheet">
          <div className="held-pay-card">
            <header>
              <strong>
                {t('hold.payNow')} — {paying.holdLabel || paying.id}
              </strong>
              <button onClick={closePay} aria-label={t('common.close')}>
                <X size={16} />
              </button>
            </header>
            <div className="held-pay-methods">
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
              <>
                <label className="held-pay-amount">
                  <span>{t('pending.received')}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={received}
                    onChange={(event) => setReceived(event.target.value)}
                  />
                </label>
                <label className="held-pay-amount">
                  <span>{t('pending.receivedKhr')}</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={receivedKhr}
                    onChange={(event) => setReceivedKhr(event.target.value)}
                  />
                </label>
              </>
            ) : (
              <p className="held-pay-note">{t('pending.khqrNote')}</p>
            )}
            <button
              className="held-pay-confirm"
              disabled={
                busy ||
                (method === 'Cash' &&
                  Number(received) <= 0 &&
                  Number(receivedKhr.replace(/[^0-9]/g, '') || 0) <= 0)
              }
              onClick={() => {
                const usdCents =
                  method === 'Cash'
                    ? Math.round(Number(received || 0) * 100)
                    : 0
                const khrReceived =
                  method === 'Cash'
                    ? Math.max(
                        0,
                        Math.round(
                          Number(receivedKhr.replace(/[^0-9]/g, '') || 0),
                        ),
                      )
                    : 0
                onPay(paying, method, { usdReceivedCents: usdCents, khrReceived })
                setPaying(null)
              }}
            >
              {t('pending.confirmPayment')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
