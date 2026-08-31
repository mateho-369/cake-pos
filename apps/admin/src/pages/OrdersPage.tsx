import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  Banknote,
  CheckCircle,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  MoreHorizontal,
  Phone,
  Printer,
  ReceiptText,
  ScanLine,
  Search,
  Send,
  ShoppingBag,
  Store,
  X,
} from 'lucide-react'
import { type Order } from '../data'
import { statusLabel, useTranslation } from '../lib/i18n'
import { useAdminData } from '../lib/data'
import { apiRequest } from '../lib/api'
import { printReceipt } from '../lib/receipt'
import {
  exportOrdersExcel,
  exportSummaryWord,
  ordersInRange,
} from '../lib/exports'

// Money is safe even when the API omits a field (a null/undefined value must
// never throw `toFixed is not a function` on the admin dashboard).
const asNumber = (value: number | null | undefined) =>
  Number.isFinite(value as number) ? (value as number) : 0
const usd = (value: number | null | undefined) =>
  `$${asNumber(value).toFixed(2)}`
const khr = (value: number | null | undefined) =>
  `${Math.round(asNumber(value)).toLocaleString()} ៛`
const centsUsd = (cents: number | null | undefined) =>
  `$${(asNumber(cents) / 100).toFixed(2)}`
const statusClass = (status: string) => `order-status-${status.toLowerCase()}`
// Cash tender payload for the admin Take Payment modal. Mirrors the sale
// terminal's `cashTenderPayload`: all change is returned in USD cents (KHR
// change = 0), matching CashTender::validate on the server, so the admin
// override cannot bypass the real payment-recording contract.
function adminCashTender(
  totalCents: number,
  usdCents: number,
  khr: number,
  rate: number,
) {
  const safeRate = Math.trunc(rate) > 0 ? Math.trunc(rate) : 4100
  const total = Math.max(0, Math.trunc(totalCents))
  const usd = Math.max(0, Math.trunc(usdCents))
  const riel = Math.max(0, Math.trunc(khr))
  const dueCentRiel = total * safeRate
  const tenderCentRiel = usd * safeRate + riel * 100
  const changeCentRiel = Math.max(0, tenderCentRiel - dueCentRiel)
  return {
    usdReceivedCents: usd,
    khrReceived: riel,
    changeUsdCents: Math.round(changeCentRiel / safeRate),
    changeKhr: 0,
    exchangeRateKhrPerUsd: safeRate,
  }
}
// A hold that was resumed and paid is closed as Cancelled solely so revenue
// is not double-counted; it is NOT a rejection. The status event's reason
// (`hold_paid`) is what lets the UI show "Converted → CS-4" instead of a
// misleading Cancelled label.
const isHoldConverted = (order: Pick<Order, 'status' | 'statusChange'>) =>
  order.status === 'Cancelled' &&
  order.statusChange?.reason === 'hold_paid'
const convertedPaidOrderId = (
  order: Pick<Order, 'status' | 'statusChange'>,
) =>
  isHoldConverted(order)
    ? String(order.statusChange?.paidOrderId ?? '')
    : ''

/**
 * Status chip. Cancelled + `hold_paid` renders as "Converted → <paid order>"
 * and the paid order id is a link back to the actual sale. Genuine rejects
 * and discards keep the plain Cancelled label.
 */
function OrderStatusBadge({
  order,
  onConverted,
  className = '',
}: {
  order: Order
  onConverted?: (id: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  const paidId = convertedPaidOrderId(order)
  if (isHoldConverted(order) && paidId) {
    return (
      <span
        className={`status-badge order-status-converted ${className}`}
        title={t('orders.convertedToPaid', { id: paidId })}
      >
        <i />
        {t('orders.converted')}
        <span
          role="button"
          tabIndex={0}
          className="converted-link"
          onClick={(event) => {
            event.stopPropagation()
            onConverted?.(paidId)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.stopPropagation()
              event.preventDefault()
              onConverted?.(paidId)
            }
          }}
        >
          {paidId}
        </span>
      </span>
    )
  }
  return (
    <span className={`status-badge ${statusClass(order.status)} ${className}`}>
      <i />
      {statusLabel(t, order.status)}
    </span>
  )
}

/**
 * Live "pending customer orders" panel: Telegram self-orders that are held
 * (unpaid) until the customer arrives. Polls every 15 s so new orders appear
 * without any manual refresh.
 */
function PendingCustomerOrders({
  onToast,
  rate,
}: {
  onToast: (message: string) => void
  rate: number
}) {
  const { t } = useTranslation()
  const { refresh, updateOrder } = useAdminData()
  const [pending, setPending] = useState<Order[]>([])
  const [paying, setPaying] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    apiRequest<Order[]>('/api/orders/pending')
      .then(setPending)
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    load()
    const timer = window.setInterval(load, 15000)
    return () => window.clearInterval(timer)
  }, [load])
  const setStatus = async (order: Order, next: Order['status']) => {
    setBusy(true)
    try {
      await updateOrder(order.id, { status: next })
      await load()
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }
  const submitPayment = async (
    order: Order,
    method: 'Cash' | 'KHQR',
    usdReceived: string,
    khrReceived: string,
  ) => {
    setBusy(true)
    try {
      const usdCents = Math.round(Number(usdReceived || 0) * 100)
      const khr = Math.round(Number(khrReceived.replace(/[^0-9]/g, '') || 0))
      await apiRequest(`/api/orders/${order.id}/pay`, {
        method: 'POST',
        body: JSON.stringify(
          method === 'Cash'
            ? {
                method: 'Cash',
                ...adminCashTender(
                  Math.round(asNumber(order.total) * 100),
                  usdCents,
                  khr,
                  rate,
                ),
              }
            : { method: 'KHQR', confirmed: true },
        ),
      })
      setPaying(null)
      onToast(t('orders.pendingPaid', { id: order.id }))
      await refresh()
      await load()
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : 'Payment failed')
    } finally {
      setBusy(false)
    }
  }
  if (!pending.length)
    return (
      <section className="glass-panel pending-orders-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Telegram</span>
            <h2>{t('reports.pendingOrders')}</h2>
          </div>
          <span className="live-badge">
            <i /> {t('dashboard.live')}
          </span>
        </div>
        <p className="pending-empty">{t('reports.noPendingOrders')}</p>
      </section>
    )
  return (
    <section className="glass-panel pending-orders-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Telegram</span>
          <h2>{t('reports.pendingOrders')}</h2>
        </div>
        <span className="live-badge">
          <i /> {t('dashboard.live')}
        </span>
      </div>
      <div className="pending-orders-list">
        {pending.map((order) => (
          <article
            className={`pending-order-card ${order.isStale ? 'stale' : ''}`}
            key={order.id}
          >
            <div className="pending-order-code">
              <span>{t('reports.orderCode')}</span>
              <strong>{order.pickupCode || order.id}</strong>
            </div>
            <div className="pending-order-copy">
              <strong>
                {order.customer?.name || 'Customer'}
                {order.isStale && (
                  <em className="stale-flag">
                    <AlertTriangle size={11} /> {t('reports.staleOrder')}
                  </em>
                )}
              </strong>
              <small>
                {order.customer?.phone ? (
                  <a href={`tel:${order.customer.phone}`}>
                    <Phone size={11} /> {order.customer.phone}
                  </a>
                ) : (
                  t('customers.phoneNotShared')
                )}
              </small>
              <small>{order.detail.join('; ')}</small>
              <small className="pending-order-meta">
                {order.id} · {t('reports.placedAt')}{' '}
                {new Date(order.createdAt).toLocaleString()} · {statusLabel(t, order.status)}
              </small>
            </div>
            <div className="pending-order-total">
              <strong>{usd(order.total)}</strong>
            </div>
            <div className="pending-order-actions">
              {order.status === 'Pending' && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void setStatus(order, 'Confirmed')}
                >
                  {t('reports.confirmOrder')}
                </button>
              )}
              {order.status === 'Confirmed' && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void setStatus(order, 'Ready')}
                >
                  {t('reports.markReady')}
                </button>
              )}
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => setPaying(order)}
              >
                <Banknote size={15} /> {t('reports.takePayment')}
              </button>
            </div>
          </article>
        ))}
      </div>
      {paying && (
        <PayHeldOrderModal
          order={paying}
          busy={busy}
          rate={rate}
          withKhr
          onClose={() => setPaying(null)}
          onSubmit={submitPayment}
        />
      )}
    </section>
  )
}

function PayHeldOrderModal({
  order,
  busy,
  onClose,
  onSubmit,
  rate,
  withKhr = false,
}: {
  order: Order
  busy: boolean
  onClose: () => void
  onSubmit: (
    order: Order,
    method: 'Cash' | 'KHQR',
    usdReceived: string,
    khrReceived: string,
  ) => void
  rate: number
  withKhr?: boolean
}) {
  const { t } = useTranslation()
  const [method, setMethod] = useState<'Cash' | 'KHQR'>('Cash')
  const [received, setReceived] = useState(asNumber(order.total).toFixed(2))
  const [receivedKhr, setReceivedKhr] = useState('')
  const usdCents = Math.round(Number(received || 0) * 100)
  const khr = Math.round(Number(receivedKhr.replace(/[^0-9]/g, '') || 0))
  const tender = method === 'Cash'
    ? adminCashTender(
        Math.round(asNumber(order.total) * 100),
        usdCents,
        khr,
        rate,
      )
    : null
  const changeUsd = tender ? tender.changeUsdCents / 100 : 0
  const changeKhr = tender ? tender.changeKhr : 0
  const canConfirm =
    method === 'KHQR' || (usdCents > 0 || khr > 0)
  return createPortal(
    <div className="modal-layer" role="dialog" aria-modal="true">
      <button
        className="modal-backdrop"
        onClick={onClose}
        aria-label={t('modal.closeDialog')}
      />
      <section className="modal-card modal-small">
        <header className="modal-header">
          <div>
            <span>Telegram</span>
            <h2>
              {t('reports.takePayment')} — {order.pickupCode || order.id}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t('modal.close')}
          >
            <X size={19} />
          </button>
        </header>
        <div className="modal-form pay-held-form">
          <p className="pay-held-total">
            {order.customer?.name || 'Customer'} ·{' '}
            <strong>{usd(order.total)}</strong>
          </p>
          <div className="filter-tabs">
            <button
              className={method === 'Cash' ? 'active' : ''}
              onClick={() => setMethod('Cash')}
            >
              <Banknote size={14} /> {t('payment.cash')}
            </button>
            <button
              className={method === 'KHQR' ? 'active' : ''}
              onClick={() => setMethod('KHQR')}
            >
              <ScanLine size={14} /> {t('payment.khqr')}
            </button>
          </div>
          {method === 'Cash' && (
            <>
              <label>
                <span>{t('shifts.countedCash')}</span>
                <div className="currency-input">
                  <span>$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={received}
                    onChange={(event) => setReceived(event.target.value)}
                  />
                </div>
              </label>
              {withKhr && (
                <label>
                  <span>{t('shifts.countedCashKhr')}</span>
                  <div className="currency-input">
                    <span>៛</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      step="100"
                      min="0"
                      value={receivedKhr}
                      onChange={(event) => setReceivedKhr(event.target.value)}
                    />
                  </div>
                  <small>
                    {t('shifts.countInstructionKhr')} · {rate} ៛ / $
                  </small>
                </label>
              )}
              {usdCents > 0 || khr > 0 ? (
                <div className="form-notice success">
                  <span>
                    {t('shifts.change')}: {centsUsd(tender?.changeUsdCents ?? 0)}
                    {changeKhr > 0 ? ` · ៛${changeKhr.toLocaleString()}` : ''}
                  </span>
                </div>
              ) : null}
            </>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={busy}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy || !canConfirm}
              onClick={() =>
                onSubmit(order, method, received, receivedKhr)
              }
            >
              {t('orders.paymentConfirmedShort')}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

type OrdersPageProps = {
  selectedId: string | null
  onSelect: (id: string | null) => void
  onToast: (message: string) => void
}
const telegramStatuses: Order['status'][] = [
  'Pending',
  'Confirmed',
  'Held',
  'Ready',
]
export default function OrdersPage({
  selectedId,
  onSelect,
  onToast,
}: OrdersPageProps) {
  const { t } = useTranslation()
  const { orders, updateOrder, correctOrder, refresh } = useAdminData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [rate, setRate] = useState(4100)
  const [takePayment, setTakePayment] = useState<Order | null>(null)
  const [payBusy, setPayBusy] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!exportOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExportOpen(false)
    }
    const onDown = (event: MouseEvent) => {
      if (!exportRef.current?.contains(event.target as Node)) setExportOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [exportOpen])
  useEffect(() => {
    apiRequest<{ exchangeRateKhrPerUsd?: number }>('/api/settings/pos-rules')
      .then((value) =>
        setRate(
          Number.isFinite(value?.exchangeRateKhrPerUsd as number)
            ? (value?.exchangeRateKhrPerUsd as number)
            : 4100,
        ),
      )
      .catch(() => undefined)
  }, [])
  const selected = orders.find((order) => order.id === selectedId) || null
  const selectedHasConfirmedPayment =
    (selected?.payments ?? []).some(
      (payment) => payment.status === 'confirmed',
    )
  const selectedCanTakePayment =
    selected !== null &&
    (['Pending', 'Confirmed', 'Held', 'Ready'].includes(selected.status) ||
      (selected.status === 'Paid' &&
        selected.paymentStatus !== 'paid' &&
        !selectedHasConfirmedPayment))
  const statuses = [
    'all',
    'Pending',
    'Confirmed',
    'Paid',
    'Ready',
    'Held',
    'Completed',
    'Refunded',
    'Cancelled',
    'Released',
  ]
  const visible = useMemo(
    () =>
      ordersInRange(orders, from, to).filter((order) => {
        const matches =
          `${order.id} ${order.cashier} ${order.customer?.name || ''} ${order.payment || ''}`
            .toLowerCase()
            .includes(query.toLowerCase())
        return matches && (status === 'all' || order.status === status)
      }),
    [orders, query, status, from, to],
  )
  const save = async (input: { status?: Order['status']; total?: number }) => {
    if (!selected) return
    try {
      await updateOrder(selected.id, input)
      onToast('Telegram order updated')
    } catch (reason) {
      onToast(
        reason instanceof Error ? reason.message : 'Could not update order',
      )
    }
  }
  const correct = async (type: 'refund' | 'void') => {
    if (
      !selected ||
      !window.confirm(
        `Create a linked ${type} record for ${selected.id}? The original order will remain unchanged.`,
      )
    )
      return
    try {
      await correctOrder(selected.id, { type })
      onToast(`${type === 'refund' ? 'Refund' : 'Void'} record created`)
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : 'Could not create correction',
      )
    }
  }
  const payFromDetail = async (
    order: Order,
    method: 'Cash' | 'KHQR',
    usdReceived: string,
    khrReceived: string,
  ) => {
    setPayBusy(true)
    try {
      const usdCents = Math.round(Number(usdReceived || 0) * 100)
      const khr = Math.round(Number(khrReceived.replace(/[^0-9]/g, '') || 0))
      await apiRequest(`/api/orders/${order.id}/pay`, {
        method: 'POST',
        body: JSON.stringify(
          method === 'Cash'
            ? {
                method: 'Cash',
                ...adminCashTender(
                  Math.round(asNumber(order.total) * 100),
                  usdCents,
                  khr,
                  rate,
                ),
              }
            : { method: 'KHQR', confirmed: true },
        ),
      })
      setTakePayment(null)
      onToast(t('orders.pendingPaid', { id: order.id }))
      await refresh()
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : 'Payment failed')
    } finally {
      setPayBusy(false)
    }
  }
  return (
    <div className="page-content">
      <PendingCustomerOrders onToast={onToast} rate={rate} />
      <section className="kpi-grid compact-kpis">
        <article className="mini-kpi glass-panel">
          <span>{t('orders.telegramOrders')}</span>
          <strong>
            {orders.filter((order) => order.source === 'telegram').length}
          </strong>
          <small>{t('orders.customerMiniApp')}</small>
        </article>
        <article className="mini-kpi glass-panel">
          <span>{t('orders.awaitingConfirmation')}</span>
          <strong>
            {orders.filter((order) => order.status === 'Pending').length}
          </strong>
          <small>{t('orders.needsReply')}</small>
        </article>
        <article className="mini-kpi glass-panel">
          <span>{t('orders.transactions')}</span>
          <strong>{orders.length}</strong>
          <small>{t('orders.allSources')}</small>
        </article>
        <article className="mini-kpi glass-panel">
          <span>{t('orders.readyPickup')}</span>
          <strong>
            {orders.filter((order) => order.status === 'Ready').length}
          </strong>
          <small>{t('orders.notifyCustomers')}</small>
        </article>
      </section>
      <section className="page-toolbar catalog-toolbar">
        <div className="filter-row">
          <label className="inline-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('orders.search')}
            />
          </label>
          <div className="filter-tabs">
            {statuses.map((item) => (
              <button
                key={item}
                className={status === item ? 'active' : ''}
                onClick={() => setStatus(item)}
              >
                {item === 'all' ? t('common.all') : statusLabel(t, item)}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-actions report-export-actions">
          <label>
            {t('orders.from')}
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            {t('orders.to')}
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <div className="export-menu" ref={exportRef}>
            <button
              type="button"
              className="primary-button"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((open) => !open)}
            >
              <Download size={15} /> {t('common.export')}
              <ChevronDown size={14} />
            </button>
            {exportOpen && (
              <div className="export-menu-list" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false)
                    void exportSummaryWord(visible, from, to).catch((error) =>
                      onToast(error.message),
                    )
                  }}
                >
                  <FileText size={15} /> Word
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false)
                    void exportOrdersExcel(visible, from, to).catch((error) =>
                      onToast(error.message),
                    )
                  }}
                >
                  <FileSpreadsheet size={15} /> Excel
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
      <section className={`orders-layout ${selected ? 'with-detail' : ''}`}>
        <div className="glass-panel orders-full-table table-responsive">
          <div className="order-full-row phase2-order-row table-head">
            <span>{t('orders.order')}</span>
            <span>{t('orders.source')}</span>
            <span>{t('orders.customerCashier')}</span>
            <span>{t('orders.items')}</span>
            <span>{t('orders.payment')}</span>
            <span>{t('orders.status')}</span>
            <span>{t('orders.total')}</span>
            <span />
          </div>
          {visible.map((order) => (
            <button
              className={`order-full-row phase2-order-row ${selectedId === order.id ? 'selected' : ''}`}
              key={order.id}
              onClick={() => onSelect(order.id)}
            >
              <strong>{order.id}</strong>
              <span className={`source-pill ${order.source}`}>
                {order.source === 'telegram' ? (
                  <Send size={13} />
                ) : (
                  <Store size={13} />
                )}
                <strong>
                  {order.source === 'telegram'
                    ? t('orders.telegram')
                    : t('orders.walkIn')}
                </strong>
              </span>
              <span>
                <strong>{order.customer?.name || order.cashier}</strong>
                <small>
                  {order.time} · {order.date}
                </small>
              </span>
              <span className="order-row-meta">
                <span>{order.items}</span>
                <span className="payment-pill">
                  {order.payment === 'KHQR' ? (
                    <ScanLine size={14} />
                  ) : order.payment === 'Cash' ? (
                    <Banknote size={14} />
                  ) : (
                    <ShoppingBag size={14} />
                  )}{' '}
                  {order.payment || t('orders.notPaid')}
                </span>
              </span>
              <OrderStatusBadge order={order} onConverted={onSelect} />
              <strong className="numeric">{usd(order.total)}</strong>
              <MoreHorizontal size={17} />
            </button>
          ))}
        </div>
        {selected && (
            <aside className="glass-panel order-detail">
              <div className="order-detail-head">
                <div>
                  <span>
                    {selected.source === 'telegram'
                      ? 'TELEGRAM ORDER'
                      : t('orders.orderDetails')}
                  </span>
                  <h2>{selected.id}</h2>
                </div>
                <div className="order-detail-actions">
                  <OrderStatusBadge
                    order={selected}
                    onConverted={onSelect}
                  />
                  <button
                    className="text-button"
                    onClick={() => onSelect(null)}
                    aria-label={t('common.close')}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {selected.customer && (
                <div className="telegram-customer-note">
                  <Send size={16} />
                  <span>
                    <strong>{selected.customer.name}</strong>
                    <small>
                      {selected.customer.phone || 'Phone unavailable'}
                      {selected.customer.telegram_username
                        ? ` · @${selected.customer.telegram_username}`
                        : ''}
                    </small>
                  </span>
                </div>
              )}

              <div className="receipt-meta">
                <div>
                  <span>{t('orders.source')}</span>
                  <strong>
                    {selected.source === 'telegram'
                      ? t('orders.telegram')
                      : t('orders.walkIn')}
                  </strong>
                </div>
                <div>
                  <span>{t('orders.date')}</span>
                  <strong>
                    {selected.date} · {selected.time}
                  </strong>
                </div>
                <div>
                  <span>{t('orders.customerCashier')}</span>
                  <strong>{selected.cashier}</strong>
                </div>
                <div>
                  <span>{t('orders.payment')}</span>
                  <strong>
                    {selected.payment || t('orders.notPaid')}
                    {selected.paymentStatus
                      ? ` · ${selected.paymentStatus}`
                      : ''}
                  </strong>
                </div>
              </div>

              <div className="receipt-lines">
                <span>
                  {t('orders.items')} ({selected.items})
                </span>
                {(selected.lineItems?.length
                  ? selected.lineItems
                  : selected.detail.map((description) => ({
                      productId: null,
                      description,
                      quantity: 1,
                      unitPriceCents: 0,
                    }))
                ).map((line, index) => (
                  <div key={`${line.productId ?? index}-${line.description ?? index}`}>
                    <span>
                      <strong>{line.description}</strong>
                      <small>
                        {line.quantity} × {centsUsd(line.unitPriceCents)}
                      </small>
                    </span>
                    <strong className="numeric">
                      {centsUsd(line.unitPriceCents * line.quantity)}
                    </strong>
                  </div>
                ))}
              </div>

              <div className="receipt-total">
                <span>
                  <small>{t('orders.subtotal')}</small>
                  <strong>{usd(selected.subtotal ?? selected.total)}</strong>
                </span>
                {selected.discountAmount ? (
                  <span>
                    <small>{t('orders.discount')}</small>
                    <strong>-{usd(selected.discountAmount)}</strong>
                  </span>
                ) : null}
                <span className="grand-total">
                  <small>{t('orders.total')}</small>
                  <strong>{usd(selected.total)}</strong>
                </span>
              </div>

              {selected.status === 'Completed' && selected.payments?.length ? (
                <div className="payment-breakdown">
                  <span>{t('orders.paymentBreakdown')}</span>
                  {selected.payments.map((payment) => {
                    const hasTender =
                      payment.tenderedUsdCents != null ||
                      payment.tenderedKhr != null
                    const hasChange =
                      payment.changeUsdCents != null ||
                      payment.changeKhr != null
                    return (
                      <div className="payment-row" key={payment.id}>
                        <div className="payment-row-head">
                          <strong>
                            {payment.method === 'cash'
                              ? t('payment.cash')
                              : t('payment.khqr')}
                          </strong>
                          <span>{centsUsd(payment.amountUsdCents)}</span>
                        </div>
                        {hasTender && (
                          <div className="payment-row-values">
                            <span>
                              {t('shifts.tendered')}:{' '}
                              {payment.tenderedUsdCents != null &&
                                `${usd(payment.tenderedUsdCents / 100)} + `}
                              {payment.tenderedKhr != null
                                ? khr(payment.tenderedKhr)
                                : null}
                            </span>
                          </div>
                        )}
                        {hasChange && (
                          <div className="payment-row-values change">
                            <span>
                              {t('shifts.change')}:{' '}
                              {payment.changeUsdCents != null &&
                                `${usd(payment.changeUsdCents / 100)} + `}
                              {payment.changeKhr != null
                                ? khr(payment.changeKhr)
                                : null}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : null}

              {selected.status === 'Held' && (
                <div className="receipt-confirmation held">
                  <ShoppingBag size={17} />
                  <span>
                    <strong>{t('orders.heldInCart')}</strong>
                    <small>{t('orders.heldNotCancelled')}</small>
                  </span>
                </div>
              )}

              {selected.status === 'Cancelled' &&
                isHoldConverted(selected) && (
                  <div className="receipt-confirmation converted">
                    <CheckCircle size={17} />
                    <span>
                      <strong>
                        {t('orders.convertedToPaid', {
                          id: convertedPaidOrderId(selected),
                        })}
                      </strong>
                      <small>{t('orders.convertedNote')}</small>
                    </span>
                  </div>
                )}
              {selected.status === 'Cancelled' &&
                !isHoldConverted(selected) &&
                selected.source === 'telegram' && (
                  <div className="receipt-confirmation cancelled">
                    <AlertTriangle size={17} />
                    <span>
                      <strong>{t('orders.cancelledByCustomer')}</strong>
                      <small>{t('orders.cancelledBeforeAccept')}</small>
                    </span>
                  </div>
                )}

              {selected.source === 'telegram' ? (
                <div className="telegram-order-controls">
                  <label>
                    <span>Final agreed price</span>
                    <div className="admin-price-input">
                      <b>$</b>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={selected.total}
                        disabled={
                          selected.status === 'Completed' ||
                          selected.status === 'Cancelled' ||
                          selected.status === 'Released'
                        }
                        onBlur={(event) => {
                          const total = Number(event.target.value)
                          if (total !== selected.total) void save({ total })
                        }}
                      />
                    </div>
                  </label>
                  <label>
                    <span>Order status</span>
                    <select
                      value={selected.status}
                      disabled={
                        selected.status === 'Completed' ||
                        selected.status === 'Paid' ||
                        selected.status === 'Cancelled' ||
                        selected.status === 'Released'
                      }
                      onChange={(event) =>
                        void save({
                          status: event.target.value as Order['status'],
                        })
                      }
                    >
                      {telegramStatuses.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                      {selected.status === 'Paid' && (
                        <option value="Paid" disabled>
                          Paid — no payment recorded; use Take Payment
                        </option>
                      )}
                      {selected.status === 'Completed' && (
                        <option value="Completed" disabled>
                          Completed
                        </option>
                      )}
                    </select>
                  </label>
                  <p>
                    Confirm the final price with the customer in Telegram.
                    Payment is recorded only through Take Payment, which
                    captures the real method and cash tender.
                  </p>
                  {!selectedHasConfirmedPayment &&
                    ['Paid', 'Completed'].includes(selected.status) && (
                      <div className="form-notice warning">
                        <AlertTriangle size={15} />
                        <span>
                          {selected.status === 'Paid'
                            ? 'Paid without a payment record — use Take Payment to record the real method and tender.'
                            : 'Legacy Completed without an OrderPayment — report-only; run the audit command and do not re-pay this order.'}
                        </span>
                      </div>
                    )}
                  {selectedCanTakePayment && (
                    <button
                      className="primary-button"
                      disabled={payBusy}
                      onClick={() => setTakePayment(selected)}
                    >
                      <Banknote size={15} /> {t('reports.takePayment')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="receipt-confirmation">
                  <ReceiptText size={17} />
                  <span>
                    <strong>
                      {selected.status === 'Completed'
                        ? t('orders.paymentConfirmed')
                        : t('orders.paymentPending')}
                    </strong>
                    <small>{selected.cashier}</small>
                  </span>
                </div>
              )}

              {selected.status === 'Completed' && (
                <div className="audit-correction-actions">
                  <strong>Audit-safe correction</strong>
                  <button
                    className="secondary-button"
                    onClick={() => void correct('refund')}
                  >
                    Create refund record
                  </button>
                  <button
                    className="danger-outline"
                    onClick={() => void correct('void')}
                  >
                    Create void record
                  </button>
                </div>
              )}

              <div className="receipt-print-actions">
                <span>
                  <Printer size={15} /> Reprint receipt
                </span>
                <button
                  className="secondary-button"
                  onClick={() =>
                    void printReceipt(selected.id, 1).catch((error) =>
                      onToast(error.message),
                    )
                  }
                >
                  Customer copy
                </button>
                <button
                  className="primary-button"
                  onClick={() =>
                    void printReceipt(selected.id, 2).catch((error) =>
                      onToast(error.message),
                    )
                  }
                >
                  Customer + Store
                </button>
              </div>
            </aside>
        )}
      </section>
      {takePayment && (
        <PayHeldOrderModal
          order={takePayment}
          busy={payBusy}
          rate={rate}
          withKhr
          onClose={() => setTakePayment(null)}
          onSubmit={payFromDetail}
        />
      )}
    </div>
  )
}
