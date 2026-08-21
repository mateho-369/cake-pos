import { Check, Printer, ScanLine } from 'lucide-react'
import type { PaymentMethod } from './CartPanel'
import { useTranslation } from '../lib/i18n'
import { printReceipt } from '../lib/receipt'
export default function SuccessOverlay({
  total,
  method,
  orderId,
  onError,
}: {
  total: number
  method: PaymentMethod
  orderId: string
  onError: (message: string) => void
}) {
  const { t } = useTranslation()
  const print = (copies: 1 | 2) =>
    void printReceipt(orderId, copies).catch((error) =>
      onError(
        error instanceof Error ? error.message : 'Could not print receipt',
      ),
    )
  return (
    <div className="success-layer" role="status" aria-live="polite">
      <div className="success-glow" />
      <section className="success-card glass-panel">
        <div className="success-check">
          <span>
            <Check size={40} strokeWidth={2.5} />
          </span>
        </div>
        <span className="success-kicker">{t('sale.paymentComplete')}</span>
        <h2>${total.toFixed(2)}</h2>
        <p>{t('sale.paidOrder', { number: orderId.replace(/^CS-/, '') })}</p>
        <div className="success-meta">
          <span>
            {method === 'khqr' ? <ScanLine size={17} /> : <Printer size={17} />}{' '}
            {method === 'khqr'
              ? t('sale.khqrConfirmed')
              : t('sale.cashReceivedShort')}
          </span>
          <span>{t('sale.receiptReady')}</span>
        </div>
        <div className="success-print-choice">
          <button onClick={() => print(1)}>
            <Printer size={15} /> Customer copy
          </button>
          <button onClick={() => print(2)}>
            <Printer size={15} /> Customer + Store
          </button>
        </div>
        <small>{t('sale.preparing')}</small>
        <i className="success-progress" />
      </section>
    </div>
  )
}
