import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Banknote, QrCode, X } from 'lucide-react'
import type { PaymentMethod, Settings } from '../types'
import { money } from '../lib/money'
import KhqrCode from './KhqrCode'

export default function PaymentSheet({
  open,
  total,
  onClose,
  onConfirm,
  initialMethod = 'cash',
  settings,
}: {
  open: boolean
  total: number
  onClose: () => void
  onConfirm: (method: PaymentMethod, cashTendered?: number) => void
  initialMethod?: PaymentMethod
  settings: Pick<Settings, 'khqrAccount' | 'khqrMerchantName'>
}) {
  const [method, setMethod] = useState<PaymentMethod>(initialMethod)
  const [tender, setTender] = useState('')

  useEffect(() => {
    if (open) setMethod(initialMethod)
  }, [open, initialMethod])

  const tendered = Math.round(Number(tender || '0') * 100)
  const change = tendered - total
  const enough = method === 'khqr' || tendered >= total

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']

  const press = (k: string) => {
    if (k === '⌫') return setTender((v) => v.slice(0, -1))
    if (k === '.' && tender.includes('.')) return
    if (tender.includes('.') && tender.split('.')[1].length >= 2) return
    setTender((v) => (v === '0' && k !== '.' ? k : v + k))
  }

  const quick = useMemo(() => {
    const exact = (total / 100).toFixed(2)
    const up = Math.ceil(total / 500) * 5
    const up2 = up + 5
    return [exact, up.toFixed(2), up2.toFixed(2)]
  }, [total])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center sm:items-center"
          style={{ background: 'rgba(59,10,31,0.28)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="sheet w-full max-w-md rounded-t-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-[28px]"
            initial={{ y: 48 }}
            animate={{ y: 0 }}
            exit={{ y: 48 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--pink-deep)' }}>
                  Charge
                </p>
                <p className="price text-3xl">{money(total)}</p>
              </div>
              <button type="button" className="btn-glass h-10 w-10 !p-0" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`btn-glass ${method === 'cash' ? 'btn-pink-ring' : ''}`}
                onClick={() => setMethod('cash')}
              >
                <Banknote size={16} /> Cash
              </button>
              <button
                type="button"
                className={`btn-glass ${method === 'khqr' ? 'btn-pink-ring' : ''}`}
                onClick={() => setMethod('khqr')}
              >
                <QrCode size={16} /> KHQR
              </button>
            </div>

            {method === 'cash' ? (
              <div>
                <p className="field-label">Amount received</p>
                <p className="mb-3 text-3xl font-semibold tabular tracking-tight">{tender ? `$${tender}` : '$0.00'}</p>
                <div className="mb-3 flex gap-2">
                  {quick.map((q) => (
                    <button key={q} type="button" className="pill flex-1 justify-center" onClick={() => setTender(q)}>
                      ${q}
                    </button>
                  ))}
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {keys.map((k) => (
                    <button key={k} type="button" className="pin-key !aspect-auto h-12 !rounded-2xl !text-lg" onClick={() => press(k)}>
                      {k}
                    </button>
                  ))}
                </div>
                <p className="mb-4 text-sm" style={{ color: change >= 0 ? 'var(--ink-2)' : '#BE123C' }}>
                  Change {money(Math.max(0, change))}
                </p>
                <button
                  type="button"
                  className="btn-pink btn-pink-ring w-full"
                  disabled={!enough}
                  onClick={() => onConfirm('cash', tendered)}
                >
                  Confirm cash
                </button>
              </div>
            ) : (
              <div className="text-center">
                <div className="mx-auto w-fit rounded-[24px] bg-white p-3 shadow-sm">
                  <KhqrCode seed={`${settings.khqrAccount}-${total}`} size={180} />
                </div>
                <p className="mt-3 text-sm font-semibold">{settings.khqrMerchantName}</p>
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  {settings.khqrAccount}
                </p>
                <p className="mt-2 text-xs" style={{ color: 'var(--ink-3)' }}>
                  Customer scans · cashier confirms when paid
                </p>
                <button type="button" className="btn-pink btn-pink-ring mt-4 w-full" onClick={() => onConfirm('khqr')}>
                  Payment received
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
