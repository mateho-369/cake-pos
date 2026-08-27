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
  const cancelOrder = async (order: Order) => {
    if (!window.confirm(t('orders.cancelPendingConfirm', { id: order.id })))
      return
    setBusy(true)
    try {
      await apiRequest(`/api/orders/${order.id}/cancel`, { method: 'POST' })
      await refresh()
      await load()
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : 'Cancel failed')
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
              <strong>${order.total.toFixed(2)}</strong>
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
              <button
                className="icon-button"
                disabled={busy}
                onClick={() => void cancelOrder(order)}
                aria-label={t('common.cancel')}
                title={t('common.cancel')}
              >
                <X size={16} />
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
            <strong>${order.total.toFixed(2)}</strong>
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
    'Completed',
    'Refunded',
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
              <span
                className={`status-badge order-status-${order.status.toLowerCase()}`}
              >
                <i />
                {order.status}
              </span>
              <strong className="numeric">${order.total.toFixed(2)}</strong>
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
              <button className="text-button" onClick={() => onSelect(null)}>
                <X size={16} />
              </button>
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
            <div className="receipt-lines">
              <span>{t('orders.items')}</span>
              {selected.detail.map((item) => (
                <div key={item}>
                  <strong>{item}</strong>
                </div>
              ))}
            </div>
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
                      disabled={selected.status === 'Completed'}
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
                    disabled={selected.status === 'Completed'}
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
              <>
                <div className="receipt-total">
                  <span className="grand-total">
                    <small>{t('orders.total')}</small>
                    <strong>${selected.total.toFixed(2)}</strong>
                  </span>
                </div>
                <div className="receipt-confirmation">
                  <ReceiptText size={17} />
                  <span>
                    <strong>{t('orders.paymentConfirmed')}</strong>
                    <small>{selected.cashier}</small>
                  </span>
                </div>
              </>
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
