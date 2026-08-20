import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, Clock3, LockKeyhole, Store } from 'lucide-react'
import Modal from './Modal'

export default function ShiftModal({ open, mode, expectedCash, openingCash, cashSales, onClose, onConfirm }: {
  open: boolean
  mode: 'open' | 'close'
  expectedCash: number
  openingCash: number
  cashSales: number
  onClose: () => void
  onConfirm: (amount: number) => void
}) {
  const [amount, setAmount] = useState(mode === 'open' ? '100.00' : '')

  useEffect(() => {
    if (open) setAmount(mode === 'open' ? '100.00' : '')
  }, [open, mode])

  const numericAmount = Number(amount || 0)
  const variance = numericAmount - expectedCash

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    onConfirm(numericAmount)
    setAmount(mode === 'open' ? '100.00' : '')
  }

  return (
    <Modal open={open} onClose={onClose} eyebrow={mode === 'open' ? 'START OF DAY' : 'CASH RECONCILIATION'} title={mode === 'open' ? 'Open your shift' : 'Close your shift'} size="small">
      <form className="shift-modal-body" onSubmit={submit}>
        <div className={`shift-modal-icon ${mode}`}><span>{mode === 'open' ? <Store size={23} /> : <LockKeyhole size={23} />}</span><div><strong>{mode === 'open' ? 'BKK1 Front Counter' : 'Morning counter'}</strong><small>{mode === 'open' ? 'Thursday, 20 August · Sophea Chan' : 'Opened today at 9:00 AM'}</small></div></div>

        {mode === 'close' && <div className="shift-close-summary"><div><span>Opening float</span><strong>${openingCash.toFixed(2)}</strong></div><div><span>Cash sales</span><strong>+${cashSales.toFixed(2)}</strong></div><div className="expected-row"><span>Expected drawer</span><strong>${expectedCash.toFixed(2)}</strong></div></div>}

        <label className="shift-cash-label"><span>{mode === 'open' ? 'Opening cash amount' : 'Counted cash in drawer'}</span><div className="large-cash-input"><span>$</span><input autoFocus inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></div><small>{mode === 'open' ? 'Count the drawer before you begin selling.' : 'Count all physical cash before closing.'}</small></label>

        {mode === 'open' && <div className="float-options">{[50,100,150,200].map((value) => <button type="button" className={numericAmount === value ? 'active' : ''} key={value} onClick={() => setAmount(value.toFixed(2))}>${value}</button>)}</div>}

        {mode === 'close' && numericAmount > 0 && <div className={`variance-preview ${Math.abs(variance) < .01 ? 'balanced' : 'variance'}`}>{Math.abs(variance) < .01 ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}<div><span>{Math.abs(variance) < .01 ? 'Drawer is balanced' : variance > 0 ? 'Cash over' : 'Cash short'}</span><strong>{variance >= 0 ? '+' : '−'}${Math.abs(variance).toFixed(2)} variance</strong></div></div>}

        <div className="shift-guard"><Clock3 size={16} /><span>{mode === 'open' ? 'Orders and payments are locked until a shift is open.' : 'Closing the shift locks further orders until a new shift is opened.'}</span></div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={numericAmount < 0}>{mode === 'open' ? <><Banknote size={17} /> Open shift <ArrowRight size={16} /></> : <><LockKeyhole size={16} /> Close & reconcile</>}</button></div>
      </form>
    </Modal>
  )
}
