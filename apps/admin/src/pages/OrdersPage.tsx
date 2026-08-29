import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
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
import { useTranslation } from '../lib/i18n'
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

/**
 * Live "pending customer orders" panel: Telegram self-orders that are held
 * (unpaid) until the customer arrives. Polls every 15 s so new orders appear
 * without any manual refresh.
 */
function PendingCustomerOrders({
  onToast,
}: {
  onToast: (message: string) => void
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
  ) => {
    setBusy(true)
    try {
      await apiRequest(`/api/orders/${order.id}/pay`, {
        method: 'POST',
        body: JSON.stringify(
          method === 'Cash'
            ? {
                method: 'Cash',
                usdReceivedCents: Math.round(Number(usdReceived || 0) * 100),
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
                {new Date(order.createdAt).toLocaleString()} · {order.status}
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
}: {
  order: Order
  busy: boolean
  onClose: () => void
  onSubmit: (order: Order, method: 'Cash' | 'KHQR', usdReceived: string) => void
}) {
  const { t } = useTranslation()
  const [method, setMethod] = useState<'Cash' | 'KHQR'>('Cash')
  const [received, setReceived] = useState(order.total.toFixed(2))
  return (
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
              disabled={busy || (method === 'Cash' && Number(received) <= 0)}
              onClick={() => onSubmit(order, method, received)}
            >
              {t('orders.paymentConfirmedShort')}
            </button>
          </div>
        </div>
      </section>
    </div>
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
  'Paid',
  'Ready',
  'Completed',
]
export default function OrdersPage({
  selectedId,
  onSelect,
  onToast,
}: OrdersPageProps) {
  const { t } = useTranslation()
  const { orders, updateOrder, correctOrder } = useAdminData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const selected = orders.find((order) => order.id === selectedId) || null
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
  return (
    <div className="page-content">
      <PendingCustomerOrders onToast={onToast} />
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
                {item === 'all' ? t('common.all') : item}
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
          <button
            className="secondary-button"
            onClick={() =>
              void exportSummaryWord(visible, from, to).catch((error) =>
                onToast(error.message),
              )
            }
          >
            <FileText size={15} /> Word
          </button>
          <button
            className="primary-button"
            onClick={() =>
              void exportOrdersExcel(visible, from, to).catch((error) =>
                onToast(error.message),
              )
            }
          >
            <FileSpreadsheet size={15} /> Excel
          </button>
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
              <span className={`status-badge ${statusClass(order.status)}`}>
                <i />
                {order.status}
              </span>
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
                  <span
                    className={`status-badge ${statusClass(selected.status)}`}
                  >
                    <i />
                    {selected.status}
                  </span>
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

              {selected.payments?.length ? (
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

              {selected.status === 'Cancelled' && selected.source === 'telegram' && (
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
                    </select>
                  </label>
                  <p>
                    Confirm the final price with the customer in Telegram. Mark
                    Paid only after you verify their KHQR payment.
                  </p>
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
    </div>
  )
}
