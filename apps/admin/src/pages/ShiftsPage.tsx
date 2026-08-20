import { useState } from 'react'
import { Banknote, CheckCircle2, Clock3, Download, LockKeyhole, Plus, ScanLine, ShieldAlert } from 'lucide-react'
import Modal from '../components/Modal'

export default function ShiftsPage({ onToast }: { onToast: (message: string) => void }) {
  const [closeShift, setCloseShift] = useState(false)

  const reconcile = (event: React.FormEvent) => {
    event.preventDefault()
    setCloseShift(false)
    onToast('Shift closed and cash reconciliation saved')
  }

  return (
    <div className="page-content">
      <section className="shift-overview-grid">
        <article className="glass-panel active-shift-card">
          <div className="panel-heading"><div><span className="section-kicker">Current shift</span><h2>Morning counter</h2></div><span className="live-badge"><i /> Open</span></div>
          <div className="large-shift-time"><strong>2:47:18</strong><span><Clock3 size={15} /> Opened at 7:55 AM by Sophea</span></div>
          <div className="shift-staff-row"><span className="employee-avatar e1">SC</span><span className="employee-avatar e2 overlap">DL</span><div><strong>2 cashiers active</strong><span>Sophea Chan · Dara Lim</span></div></div>
          <button className="danger-outline full-button" onClick={() => setCloseShift(true)}><LockKeyhole size={16} /> Close & reconcile shift</button>
        </article>
        <article className="glass-panel cash-ledger-card">
          <div className="panel-heading"><div><span className="section-kicker">Cash position</span><h2>Expected drawer</h2></div><Banknote size={20} /></div>
          <strong className="cash-total">$553.07</strong>
          <div className="ledger-lines"><div><span>Opening float</span><strong>$100.00</strong></div><div><span>Cash sales</span><strong>+$453.07</strong></div><div><span>Cash refunds</span><strong>−$0.00</strong></div><div><span>Paid out</span><strong>−$0.00</strong></div></div>
        </article>
        <article className="glass-panel payment-reconcile-card">
          <div className="panel-heading"><div><span className="section-kicker">Digital payments</span><h2>KHQR confirmation</h2></div><ScanLine size={20} /></div>
          <strong className="cash-total">$771.43</strong>
          <div className="reconcile-progress"><span><i style={{ width: '100%' }} /></span><small>29 of 29 payments confirmed</small></div>
          <div className="success-note"><CheckCircle2 size={16} /><span>No confirmation mismatches detected.</span></div>
        </article>
      </section>

      <section className="glass-panel shift-history table-responsive">
        <div className="panel-heading"><div><span className="section-kicker">Control log</span><h2>Shift history</h2></div><button className="secondary-button" onClick={() => onToast('Shift history exported')}><Download size={16} /> Export</button></div>
        <div className="shift-history-row table-head"><span>Date & shift</span><span>Opened by</span><span>Duration</span><span>Net sales</span><span>Expected cash</span><span>Counted cash</span><span>Variance</span><span>Status</span></div>
        <div className="shift-history-row current"><span><strong>Aug 20 · Morning</strong><small>7:55 AM – now</small></span><span>Sophea</span><span>2h 47m</span><strong>$1,224.50</strong><span>$553.07</span><span>—</span><span>—</span><span className="status-badge info"><i />Open</span></div>
        <div className="shift-history-row"><span><strong>Aug 19 · Full day</strong><small>7:58 AM – 7:14 PM</small></span><span>Dara</span><span>11h 16m</span><strong>$2,486.20</strong><span>$1,082.60</span><span>$1,080.60</span><strong className="coral-text">−$2.00</strong><span className="status-badge success"><i />Closed</span></div>
        <div className="shift-history-row"><span><strong>Aug 18 · Full day</strong><small>8:01 AM – 6:52 PM</small></span><span>Sophea</span><span>10h 51m</span><strong>$2,214.00</strong><span>$924.00</span><span>$924.00</span><strong className="green-text">$0.00</strong><span className="status-badge success"><i />Closed</span></div>
        <div className="shift-history-row"><span><strong>Aug 17 · Full day</strong><small>7:49 AM – 7:02 PM</small></span><span>Dara</span><span>11h 13m</span><strong>$2,708.40</strong><span>$1,140.40</span><span>$1,145.40</span><strong className="amber-text">+$5.00</strong><span className="status-badge warning"><i />Reviewed</span></div>
      </section>

      <Modal open={closeShift} onClose={() => setCloseShift(false)} eyebrow="Cash control" title="Close & reconcile shift" size="medium">
        <form className="modal-form" onSubmit={reconcile}>
          <div className="reconcile-summary"><div><span>Expected cash</span><strong>$553.07</strong></div><div><span>KHQR confirmed</span><strong>$771.43</strong></div><div><span>Net sales</span><strong>$1,224.50</strong></div></div>
          <label><span>Counted cash in drawer</span><div className="currency-input"><span>$</span><input type="number" step="0.01" placeholder="0.00" required /></div><small>Count the physical drawer before entering this amount.</small></label>
          <label><span>Closing note (optional)</span><textarea rows={3} placeholder="Explain any variance or handover detail" /></label>
          <div className="form-notice warning"><ShieldAlert size={17} /><span>Closing locks this shift against further orders. Variances remain in the audit trail.</span></div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setCloseShift(false)}>Cancel</button><button className="primary-button"><LockKeyhole size={16} /> Close shift</button></div>
        </form>
      </Modal>
    </div>
  )
}
