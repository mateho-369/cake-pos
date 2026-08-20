import { useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardList, PackageCheck, Plus, Trash2 } from 'lucide-react'
import { products } from '../data'
import Modal from '../components/Modal'

type Props = { onToast: (message: string) => void }

export default function FreshnessPage({ onToast }: Props) {
  const [wasteModal, setWasteModal] = useState(false)
  const [tab, setTab] = useState('Freshness queue')

  const submitWaste = (event: React.FormEvent) => {
    event.preventDefault()
    setWasteModal(false)
    onToast('Waste record added and stock adjusted')
  }

  return (
    <div className="page-content">
      <section className="freshness-hero glass-panel">
        <div className="freshness-hero-copy"><span className="section-kicker">FEFO CONTROL</span><h2>Protect today’s freshness and margin.</h2><p>Stock is prioritized by first-expired, first-out so the team always knows what to sell first.</p><div><button className="primary-button" onClick={() => setWasteModal(true)}><Plus size={17} /> Record waste</button><button className="secondary-button" onClick={() => onToast('Freshness report exported')}>Export report</button></div></div>
        <div className="freshness-score"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" /><circle className="score-progress" cx="60" cy="60" r="48" /></svg><div><strong>94%</strong><span>freshness score</span></div><small><CheckCircle2 size={14} /> Healthy operation</small></div>
      </section>

      <section className="kpi-grid compact-kpis freshness-kpis">
        <article className="mini-kpi glass-panel"><span>Fresh & sellable</span><strong>181 units</strong><small className="green-text">97.3% of inventory</small></article>
        <article className="mini-kpi glass-panel"><span>Expires today</span><strong className="coral-text">3 units</strong><small>$90 retail value</small></article>
        <article className="mini-kpi glass-panel"><span>Expires tomorrow</span><strong className="amber-text">2 units</strong><small>$64 retail value</small></article>
        <article className="mini-kpi glass-panel"><span>Waste this week</span><strong>$38.00</strong><small className="green-text">↓ 18% vs last week</small></article>
      </section>

      <section className="filter-tabs standalone-tabs">
        {['Freshness queue', 'Waste log', 'Production batches'].map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
      </section>

      {tab === 'Freshness queue' && (
        <section className="glass-panel freshness-table table-responsive">
          <div className="panel-heading"><div><span className="section-kicker">Priority list</span><h2>Sell first</h2></div><span className="queue-updated"><i /> Updated 2 min ago</span></div>
          <div className="freshness-row freshness-head"><span>Priority</span><span>Product & batch</span><span>Made</span><span>Best before</span><span>On hand</span><span>Value at risk</span><span>Action</span></div>
          {[...products].sort((a, b) => priority(a.status) - priority(b.status)).map((product, index) => (
            <div className="freshness-row" key={product.id}>
              <span className={`priority-number p${Math.min(index + 1, 4)}`}>{index + 1}</span>
              <div className="catalog-product"><span className="catalog-image" style={{ backgroundPosition: product.imagePosition }} /><div><strong>{product.name}</strong><small>Batch B-{2000 + product.id}</small></div></div>
              <span>{product.madeAt.replace(', 2026', '')}</span>
              <span><strong>{product.bestBefore.replace(', 2026', '')}</strong><small className={`block-note ${product.status === 'Expires today' ? 'coral-text' : ''}`}>{product.status}</small></span>
              <strong>{product.stock} units</strong>
              <strong>${(product.stock * product.price).toFixed(2)}</strong>
              {product.status === 'Expired'
                ? <button className="text-button coral-text" onClick={() => setWasteModal(true)}>Write off <ChevronRight size={15} /></button>
                : <button className="text-button" onClick={() => onToast(`${product.name} flagged on sale terminal`)}>Prioritize <ChevronRight size={15} /></button>}

            </div>
          ))}
        </section>
      )}

      {tab === 'Waste log' && (
        <section className="glass-panel simple-data-card">
          <div className="panel-heading"><div><span className="section-kicker">Recorded loss</span><h2>Waste log</h2></div><button className="primary-button" onClick={() => setWasteModal(true)}><Plus size={16} /> Record waste</button></div>
          <div className="waste-log-row table-head"><span>Date</span><span>Product</span><span>Quantity</span><span>Reason</span><span>Cost impact</span><span>Recorded by</span></div>
          <div className="waste-log-row"><span>Aug 19 · 6:14 PM</span><strong>Cocoa Mini</strong><span>2 units</span><span className="reason-pill">Expired</span><strong>$14.00</strong><span>Sophea</span></div>
          <div className="waste-log-row"><span>Aug 18 · 4:32 PM</span><strong>Berry Basque</strong><span>1 unit</span><span className="reason-pill">Damaged</span><strong>$18.00</strong><span>Dara</span></div>
          <div className="waste-log-row"><span>Aug 17 · 7:02 PM</span><strong>Vanilla Cupcake</strong><span>2 units</span><span className="reason-pill">Quality</span><strong>$6.00</strong><span>Sophea</span></div>
        </section>
      )}

      {tab === 'Production batches' && (
        <section className="batch-grid">
          {products.slice(0, 4).map((product) => <article className="glass-panel batch-card" key={product.id}><div><span className="catalog-image" style={{ backgroundPosition: product.imagePosition }} /><span className={`freshness-badge ${product.status === 'Fresh' ? 'fresh' : 'warning'}`}>{product.status}</span></div><span>Batch B-{2000 + product.id}</span><h3>{product.name}</h3><dl><div><dt>Produced</dt><dd>{product.madeAt.replace(', 2026', '')}</dd></div><div><dt>Initial yield</dt><dd>{product.stock + product.sold} units</dd></div><div><dt>Sold</dt><dd>{product.sold} units</dd></div><div><dt>Remaining</dt><dd>{product.stock} units</dd></div></dl></article>)}
        </section>
      )}

      <Modal open={wasteModal} onClose={() => setWasteModal(false)} eyebrow="Inventory adjustment" title="Record product waste" size="small">
        <form className="modal-form" onSubmit={submitWaste}>
          <div className="form-grid">
            <label><span>Product</span><select required defaultValue=""><option value="" disabled>Select a product</option>{products.map((product) => <option key={product.id}>{product.name}</option>)}</select></label>
            <div className="form-grid two-columns"><label><span>Quantity</span><input type="number" min="1" defaultValue="1" required /></label><label><span>Reason</span><select><option>Expired</option><option>Damaged</option><option>Quality issue</option><option>Staff meal</option></select></label></div>
            <label><span>Note (optional)</span><textarea placeholder="Add context for the audit trail" rows={3} /></label>
          </div>
          <div className="form-notice warning"><AlertTriangle size={17} /><span>This will reduce sellable stock and create a permanent waste record.</span></div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setWasteModal(false)}>Cancel</button><button className="primary-button"><Trash2 size={16} /> Record waste</button></div>
        </form>
      </Modal>
    </div>
  )
}

function priority(status: string) {
  return status === 'Expires today' ? 0 : status === '1 day left' ? 1 : status === 'Fresh' ? 2 : 3
}
