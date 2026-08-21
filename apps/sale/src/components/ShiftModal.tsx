import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  Store,
} from 'lucide-react'
import Modal from './Modal'
import { useTranslation } from '../lib/i18n'
export default function ShiftModal({
  open,
  mode,
  expectedCash,
  openingCash,
  cashSales,
  onClose,
  onConfirm,
}: {
  open: boolean
  mode: 'open' | 'close'
  expectedCash: number
  openingCash: number
  cashSales: number
  onClose: () => void
  onConfirm: (amount: number) => void
}) {
  const { t } = useTranslation()
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
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={
        mode === 'open'
          ? t('shiftModal.startOfDay')
          : t('shiftModal.cashReconciliation')
      }
      title={
        mode === 'open'
          ? t('shiftModal.openYourShift')
          : t('shiftModal.closeYourShift')
      }
      size="small"
    >
      <form className="shift-modal-body" onSubmit={submit}>
        <div className={`shift-modal-icon ${mode}`}>
          <span>
            {mode === 'open' ? <Store size={23} /> : <LockKeyhole size={23} />}
          </span>
          <div>
            <strong>
              {mode === 'open'
                ? t('shiftModal.frontCounter')
                : t('shiftModal.morningCounter')}
            </strong>
            <small>
              {mode === 'open'
                ? t('shiftModal.openedPerson')
                : t('shiftModal.openedToday')}
            </small>
          </div>
        </div>
        {mode === 'close' && (
          <div className="shift-close-summary">
            <div>
              <span>{t('shifts.openingFloat')}</span>
              <strong>${openingCash.toFixed(2)}</strong>
            </div>
            <div>
              <span>{t('shifts.cashSales')}</span>
              <strong>+${cashSales.toFixed(2)}</strong>
            </div>
            <div className="expected-row">
              <span>{t('shiftModal.countedDrawer')}</span>
              <strong>${expectedCash.toFixed(2)}</strong>
            </div>
          </div>
        )}
        <label className="shift-cash-label">
          <span>
            {mode === 'open'
              ? t('shiftModal.openingCash')
              : t('shiftModal.countedDrawer')}
          </span>
          <div className="large-cash-input">
            <span>$</span>
            <input
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <small>
            {mode === 'open'
              ? t('shiftModal.openingInstruction')
              : t('shiftModal.closingInstruction')}
          </small>
        </label>
        {mode === 'open' && (
          <div className="float-options">
            {[50, 100, 150, 200].map((value) => (
              <button
                type="button"
                className={numericAmount === value ? 'active' : ''}
                key={value}
                onClick={() => setAmount(value.toFixed(2))}
              >
                ${value}
              </button>
            ))}
          </div>
        )}
        {mode === 'close' && numericAmount > 0 && (
          <div
            className={`variance-preview ${Math.abs(variance) < 0.01 ? 'balanced' : 'variance'}`}
          >
            {Math.abs(variance) < 0.01 ? (
              <CheckCircle2 size={19} />
            ) : (
              <AlertTriangle size={19} />
            )}
            <div>
              <span>
                {Math.abs(variance) < 0.01
                  ? t('shiftModal.drawerBalanced')
                  : variance > 0
                    ? t('shiftModal.cashOver')
                    : t('shiftModal.cashShort')}
              </span>
              <strong>
                {t('shiftModal.varianceAmount', {
                  sign: variance >= 0 ? '+' : '−',
                  amount: Math.abs(variance).toFixed(2),
                })}
              </strong>
            </div>
          </div>
        )}
        <div className="shift-guard">
          <Clock3 size={16} />
          <span>
            {mode === 'open'
              ? t('shiftModal.openGuard')
              : t('shiftModal.closeGuard')}
          </span>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="primary-button" disabled={numericAmount < 0}>
            {mode === 'open' ? (
              <>
                <Banknote size={17} /> {t('shiftModal.openShiftAction')}{' '}
                <ArrowRight size={16} />
              </>
            ) : (
              <>
                <LockKeyhole size={16} /> {t('shiftModal.closeReconcileAction')}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
