import { Check, Printer, ScanLine } from 'lucide-react'
import type { PaymentMethod } from './CartPanel'
import { useTranslation } from '../lib/i18n'
export default function SuccessOverlay({ total, method, orderNumber }: { total: number; method: PaymentMethod; orderNumber: number }) {
  const { t } = useTranslation()
  return <div className="success-layer" role="status" aria-live="polite"><div className="success-glow" /><section className="success-card glass-panel"><div className="success-check"><span><Check size={40} strokeWidth={2.5} /></span></div><span className="success-kicker">{t('sale.paymentComplete')}</span><h2>${total.toFixed(2)}</h2><p>{t('sale.paidOrder', { number: orderNumber })}</p><div className="success-meta"><span>{method === 'khqr' ? <ScanLine size={17} /> : <Printer size={17} />}{method === 'khqr' ? t('sale.khqrConfirmed') : t('sale.cashReceivedShort')}</span><span>{t('sale.receiptReady')}</span></div><small>{t('sale.preparing')}</small><i className="success-progress" /></section></div>
}
