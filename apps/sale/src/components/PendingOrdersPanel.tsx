import { useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  MessageCircle,
  PauseCircle,
  Phone,
  ScanLine,
  Send,
  X,
} from 'lucide-react'
import { useTranslation } from '../lib/i18n'
import type { PendingOrder } from '../data'
// A null/omitted total on a legacy payload must never throw in the pending UI.
const safeNumber = (value: number | null | undefined) =>
  Number.isFinite(value as number) ? (value as number) : 0
const usd = (value: number | null | undefined) =>
  `$${safeNumber(value).toFixed(2)}`

type CashTender = {
  usdReceivedCents: number
  khrReceived: number
  totalCents: number
}

type Props = {
  pending: PendingOrder[]
  shiftOpen: boolean
  /** Opened from the header toolbar even when there are no pending orders. */
  open?: boolean
  rate: number
  /** Perform the actual payment POST. */
  onPay: (
    orderId: string,
    method: 'Cash' | 'KHQR',
    tender: CashTender,
  ) => Promise<void>
  /** Park into the held queue without charging. */
  onAccept: (orderId: string) => Promise<void>
  /**
   * Send a quick Telegram note to the order's customer through the shop
   * bot. Resolves with whether Telegram actually accepted the message.
   */
  onMessage: (orderId: string, text: string) => Promise<boolean>
  /**
   * If a shift is open, run `resume` immediately; otherwise prompt to open a
   * shift and run `resume` once it is open.
   */
  onNeedShift: (resume: () => void) => void
  onToast: (message: string) => void
}

/**
 * Telegram customer orders awaiting staff action. The customer placed the
 * order in the Mini App; staff verify it (phone call or Telegram message),
 * then Accept (park as held, unpaid) or take payment on arrival. Staff cannot
 * cancel a not-yet-accepted order — before the seller accepts, only the
 * customer can cancel it in the Mini App. Several can be pending at once;
 * the panel is a queue, oldest first. An order leaves the list the moment it
 * is paid, accepted, or cancelled by the customer.
 */
export default function PendingOrdersPanel({
  pending,
  shiftOpen,
  open = false,
  onPay,
  onAccept,
  onMessage,
  onNeedShift,
  onToast,
}: Props) {
  const { t } = useTranslation()
  const [paying, setPaying] = useState<PendingOrder | null>(null)
  const [method, setMethod] = useState<'Cash' | 'KHQR'>('Cash')
  const [received, setReceived] = useState('')
  const [receivedKhr, setReceivedKhr] = useState('')
  const [busy, setBusy] = useState(false)
  const [messaging, setMessaging] = useState<PendingOrder | null>(null)
  const [note, setNote] = useState('')

  const openPay = (order: PendingOrder) => {
    setPaying(order)
    setMethod('Cash')
    setReceived(safeNumber(order.total).toFixed(2))
    setReceivedKhr('')
  }

  const openMessage = (order: PendingOrder) => {
    setMessaging(order)
    setNote('')
  }

  const doPay = (
    order: PendingOrder,
    m: 'Cash' | 'KHQR',
    usdCents: number,
    khr: number,
  ) => {
    setBusy(true)
    onPay(order.id, m, {
      usdReceivedCents: usdCents,
      khrReceived: khr,
      totalCents: Math.round(safeNumber(order.total) * 100),
    })
      .then(() => {
        setPaying(null)
        onToast(t('pending.paid', { id: order.pickupCode || order.id }))
      })
      .catch((err) =>
        onToast(err instanceof Error ? err.message : 'Payment failed'),
      )
      .finally(() => setBusy(false))
  }

  const confirmPay = () => {
    if (!paying) return
    const usdCents =
      method === 'Cash' ? Math.round(Number(received || 0) * 100) : 0
    const khr =
      method === 'Cash'
        ? Math.max(0, Math.round(Number(receivedKhr.replace(/[^0-9]/g, '') || 0)))
        : 0
    const order = paying
    onNeedShift(() => doPay(order, method, usdCents, khr))
  }

  const confirmAccept = (order: PendingOrder) => {
    onNeedShift(() => {
      setBusy(true)
      onAccept(order.id)
        .then(() =>
          onToast(t('pending.accepted', { id: order.pickupCode || order.id })),
        )
        .catch((err) =>
          onToast(err instanceof Error ? err.message : 'Accept failed'),
        )
        .finally(() => setBusy(false))
    })
  }

  const confirmMessage = () => {
    if (!messaging || !note.trim()) return
    const order = messaging
    const text = note.trim()
    setBusy(true)
    onMessage(order.id, text)
      .then((delivered) => {
        setMessaging(null)
        onToast(
          delivered
            ? t('pending.messageSent', {
                name: order.customer?.name || t('pending.customer'),
              })
            : t('pending.messageFailed'),
        )
      })
      .catch((err) =>
        onToast(
          err instanceof Error ? err.message : t('pending.messageFailed'),
        ),
      )
      .finally(() => setBusy(false))
  }

  if (!pending.length && !paying && !messaging && !open) {
    return null
  }
  return (
    <section className="pending-panel" id="pending-orders">
      <div className="pending-panel-head">
        <span>{t('pending.title')}</span>
        <em>{pending.length}</em>
      </div>
      {!pending.length ? (
        <p className="pending-panel-empty">{t('pending.empty')}</p>
      ) : (
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
                <b>{usd(order.total)}</b>
              </div>
              <div className="pending-card-body">
                <strong>{order.customer?.name || t('pending.customer')}</strong>
                {(order.customer?.phone ||
                  order.customer?.telegramUserId != null) && (
                  <div className="pending-contact">
                    {order.customer?.phone && (
                      <a
                        className="pending-phone"
                        href={`tel:${order.customer.phone}`}
                      >
                        <Phone size={11} /> {order.customer.phone}
                      </a>
                    )}
                    {order.customer?.telegramUserId != null && (
                      <button
                        className="pending-message-button"
                        disabled={busy}
                        onClick={() => openMessage(order)}
                        title={t('pending.message')}
                      >
                        <MessageCircle size={11} /> {t('pending.message')}
                      </button>
                    )}
                  </div>
                )}
                <small>{order.detail.join('; ')}</small>
              </div>
              <div className="pending-card-actions">
                <button
                  className="pending-accept-button"
                  disabled={busy}
                  onClick={() => confirmAccept(order)}
                  title={t('pending.accept')}
                >
                  <PauseCircle size={15} /> {t('pending.accept')}
                </button>
                <button
                  className="pending-pay-button"
                  disabled={busy}
                  onClick={() => openPay(order)}
                >
                  <Banknote size={15} /> {t('pending.takePayment')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
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
              <>
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
                <label className="pending-pay-amount">
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
              <p className="pending-pay-note">{t('pending.khqrNote')}</p>
            )}
            {!shiftOpen && (
              <p className="pending-pay-shift-note">{t('pending.shiftNote')}</p>
            )}
            <button
              className="pending-pay-confirm"
              disabled={
                busy ||
                (method === 'Cash' &&
                  Number(received) <= 0 &&
                  Number(receivedKhr.replace(/[^0-9]/g, '') || 0) <= 0)
              }
              onClick={confirmPay}
            >
              {t('pending.confirmPayment')}
            </button>
          </div>
        </div>
      )}
      {messaging && (
        <div className="pending-pay-sheet">
          <div className="pending-pay-card">
            <header>
              <strong>
                <Send size={14} />{' '}
                {t('pending.messageTitle', {
                  name: messaging.customer?.name || t('pending.customer'),
                })}
              </strong>
              <button onClick={() => setMessaging(null)} aria-label="Close">
                <X size={16} />
              </button>
            </header>
            <label className="pending-message-text">
              <span>{t('pending.messageLabel')}</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t('pending.messagePlaceholder')}
              />
            </label>
            <button
              className="pending-message-send"
              disabled={busy || !note.trim()}
              onClick={confirmMessage}
            >
              <Send size={14} /> {t('pending.messageSend')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
