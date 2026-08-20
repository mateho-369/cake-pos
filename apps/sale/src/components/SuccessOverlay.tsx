import { Check, Printer, ScanLine } from 'lucide-react'
import type { PaymentMethod } from './CartPanel'

export default function SuccessOverlay({ total, method, orderNumber }: { total: number; method: PaymentMethod; orderNumber: number }) {
  return (
    <div className="success-layer" role="status" aria-live="polite">
      <div className="success-glow" />
      <section className="success-card glass-panel">
        <div className="success-check"><span><Check size={40} strokeWidth={2.5} /></span></div>
        <span className="success-kicker">PAYMENT COMPLETE</span>
        <h2>${total.toFixed(2)}</h2>
        <p>Order #{orderNumber} has been paid successfully.</p>
        <div className="success-meta"><span>{method === 'khqr' ? <ScanLine size={17} /> : <Printer size={17} />}{method === 'khqr' ? 'KHQR confirmed' : 'Cash received'}</span><span>Receipt ready</span></div>
        <small>Preparing the next order…</small>
        <i className="success-progress" />
      </section>
    </div>
  )
}
