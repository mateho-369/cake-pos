import { useMemo, useState } from 'react'
import {
  Banknote,
  FileSpreadsheet,
  FileText,
  MoreHorizontal,
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
import { printReceipt } from '../lib/receipt'
import {
  exportOrdersExcel,
  exportSummaryWord,
  ordersInRange,
} from '../lib/exports'

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
      <section className="kpi-grid compact-kpis">
        <article className="mini-kpi glass-panel">
          <span>Telegram orders</span>
          <strong>
            {orders.filter((order) => order.source === 'telegram').length}
          </strong>
          <small>Customer Mini App</small>
        </article>
        <article className="mini-kpi glass-panel">
          <span>Awaiting confirmation</span>
          <strong>
            {orders.filter((order) => order.status === 'Pending').length}
          </strong>
          <small>Needs a reply</small>
        </article>
        <article className="mini-kpi glass-panel">
          <span>{t('orders.transactions')}</span>
          <strong>{orders.length}</strong>
          <small>All sources</small>
        </article>
        <article className="mini-kpi glass-panel">
          <span>Ready for pickup</span>
          <strong>
            {orders.filter((order) => order.status === 'Ready').length}
          </strong>
          <small>Notify customers</small>
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
            From
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            To
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
            <span>Order</span>
            <span>Source</span>
            <span>Customer / cashier</span>
            <span>Items</span>
            <span>Payment</span>
            <span>Status</span>
            <span>Total</span>
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
                  {order.source === 'telegram' ? 'Telegram' : 'Walk-in'}
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
                {order.payment || 'Not paid'}
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
