import { useMemo, useState } from 'react'
import { Banknote, CalendarDays, Download, Filter, MoreHorizontal, ReceiptText, RotateCcw, ScanLine, Search } from 'lucide-react'
import { orders, type Order } from '../data'

type OrdersPageProps = {
  selectedId: string | null
  onSelect: (id: string | null) => void
  onToast: (message: string) => void
}

export default function OrdersPage({ selectedId, onSelect, onToast }: OrdersPageProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const selected = orders.find((order) => order.id === selectedId) || null
  const visible = useMemo(() => orders.filter((order) => {
    const matches = `${order.id} ${order.cashier} ${order.payment}`.toLowerCase().includes(query.toLowerCase())
    return matches && (status === 'All' || order.status === status)
  }), [query, status])

  const exportOrders = () => {
    const rows = ['Order,Time,Cashier,Payment,Status,Total', ...visible.map((order) => `${order.id},${order.time},${order.cashier},${order.payment},${order.status},${order.total}`)]
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }))
    link.download = 'orders-2026-08-20.csv'
    link.click()
    URL.revokeObjectURL(link.href)
    onToast('Order report exported')
  }

  return (
    <div className="page-content">
      <section className="kpi-grid compact-kpis">
        <article className="mini-kpi glass-panel"><span>Gross sales</span><strong>$1,254.50</strong><small>Before $30 refunds</small></article>
        <article className="mini-kpi glass-panel"><span>Net sales</span><strong>$1,224.50</strong><small className="green-text">+12.4% vs yesterday</small></article>
        <article className="mini-kpi glass-panel"><span>Transactions</span><strong>47</strong><small>45 completed · 2 refunded</small></article>
        <article className="mini-kpi glass-panel"><span>Refund rate</span><strong>2.4%</strong><small>Within normal range</small></article>
      </section>

      <section className="page-toolbar catalog-toolbar">
        <div className="filter-row">
          <label className="inline-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, cashier, payment…" /></label>
          <div className="filter-tabs">
            {['All', 'Completed', 'Refunded', 'Voided'].map((item) => <button key={item} className={status === item ? 'active' : ''} onClick={() => setStatus(item)}>{item}</button>)}
          </div>
        </div>
        <div className="toolbar-actions"><button className="secondary-button"><CalendarDays size={16} /> Today</button><button className="secondary-button" onClick={exportOrders}><Download size={16} /> Export</button></div>
      </section>

      <section className={`orders-layout ${selected ? 'with-detail' : ''}`}>
        <div className="glass-panel orders-full-table table-responsive">
          <div className="order-full-row table-head"><span>Order</span><span>Time</span><span>Cashier</span><span>Items</span><span>Payment</span><span>Status</span><span>Total</span><span /></div>
          {visible.map((order) => (
            <button className={`order-full-row ${selectedId === order.id ? 'selected' : ''}`} key={order.id} onClick={() => onSelect(order.id)}>
              <strong>{order.id}</strong><span><strong>{order.time}</strong><small>{order.date}</small></span><span>{order.cashier}</span><span>{order.items}</span><span className="payment-pill">{order.payment === 'KHQR' ? <ScanLine size={14} /> : <Banknote size={14} />}{order.payment}</span><span className={`status-badge ${order.status === 'Completed' ? 'success' : order.status === 'Refunded' ? 'warning' : 'neutral'}`}><i />{order.status}</span><strong className="numeric">${order.total.toFixed(2)}</strong><MoreHorizontal size={17} />
            </button>
          ))}
        </div>

        {selected && <OrderDetail order={selected} onClose={() => onSelect(null)} onToast={onToast} />}
      </section>
    </div>
  )
}

function OrderDetail({ order, onClose, onToast }: { order: Order; onClose: () => void; onToast: (message: string) => void }) {
  return (
    <aside className="glass-panel order-detail">
      <div className="order-detail-head"><div><span>Order details</span><h2>{order.id}</h2></div><button className="text-button" onClick={onClose}>Close</button></div>
      <div className="receipt-meta"><div><span>Placed</span><strong>{order.time}, {order.date}</strong></div><div><span>Cashier</span><strong>{order.cashier}</strong></div><div><span>Payment</span><strong>{order.payment}</strong></div><div><span>Status</span><strong className={order.status === 'Completed' ? 'green-text' : 'amber-text'}>{order.status}</strong></div></div>
      <div className="receipt-lines">
        <span>Items</span>
        {order.detail.map((item) => <div key={item}><strong>{item}</strong><span>${(order.total / order.detail.length).toFixed(2)}</span></div>)}
      </div>
      <div className="receipt-total"><span><small>Subtotal</small><strong>${order.total.toFixed(2)}</strong></span><span><small>Discount</small><strong>—</strong></span><span className="grand-total"><small>Total</small><strong>${order.total.toFixed(2)}</strong></span></div>
      <div className="receipt-confirmation"><ReceiptText size={17} /><span><strong>Payment confirmed manually</strong><small>Recorded by {order.cashier} at {order.time}</small></span></div>
      <div className="detail-actions"><button className="secondary-button" onClick={() => onToast('Receipt queued for print')}><ReceiptText size={16} /> Print receipt</button><button className="danger-outline" onClick={() => onToast('Refund workflow opened')}><RotateCcw size={16} /> Refund</button></div>
    </aside>
  )
}
