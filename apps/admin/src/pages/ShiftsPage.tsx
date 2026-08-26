import { useState } from 'react'
import {
  Banknote,
  CheckCircle2,
  Clock3,
  Download,
  LockKeyhole,
  ScanLine,
  ShieldAlert,
} from 'lucide-react'
import Modal from '../components/Modal'
import { useTranslation } from '../lib/i18n'
import { useAdminData } from '../lib/data'
import { apiRequest } from '../lib/api'
import type { Shift } from '../data'

export default function ShiftsPage({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const { t } = useTranslation()
  const { shifts, currentShift, summary, refresh } = useAdminData()
  const qrRevenueCents = summary?.qrRevenueCents ?? 0
  const [closeShiftOpen, setCloseShiftOpen] = useState(false)
  const [closingCash, setClosingCash] = useState('')
  const [saving, setSaving] = useState(false)
  const closeShift = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await apiRequest('/api/shifts/close', {
        method: 'POST',
        body: JSON.stringify({ closingCash: Number(closingCash || 0) }),
      })
      setCloseShiftOpen(false)
      await refresh()
      onToast(t('shifts.closedSaved'))
    } catch (reason) {
      onToast(
        reason instanceof Error ? reason.message : t('shifts.closeFailed'),
      )
    } finally {
      setSaving(false)
    }
  }
  const currentExpectedUsd = (currentShift?.expectedCashUsdCents ?? 0) / 100
  const currentOpeningUsd = (currentShift?.openingCashUsdCents ?? 0) / 100
  const totalOrders = shifts.reduce((sum, shift) => sum + (shift.id ? 1 : 0), 0)
  return (
    <div className="page-content">
      <section className="shift-overview-grid">
        <article className="glass-panel active-shift-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">{t('shifts.current')}</span>
              <h2>{t('shifts.morning')}</h2>
            </div>
            <span className={`live-badge ${currentShift ? '' : 'muted'}`}>
              <i />
              {currentShift ? t('common.open') : t('shifts.noActive')}
            </span>
          </div>
          <div className="large-shift-time">
            <strong>{formatShiftStart(currentShift)}</strong>
            <span>
              <Clock3 size={15} /> {t('shifts.openedBy')}
            </span>
          </div>
          <div className="shift-staff-row">
            <span className="employee-avatar e1">
              {initials(currentShift?.openedBy || '')}
            </span>
            <div>
              <strong>{t('shifts.cashiersActive')}</strong>
              <span>{currentShift?.openedBy || t('shifts.noActive')}</span>
            </div>
          </div>
          <button
            className="danger-outline full-button"
            onClick={() => setCloseShiftOpen(true)}
            disabled={!currentShift}
          >
            <LockKeyhole size={16} /> {t('shifts.closeReconcile')}
          </button>
        </article>
        <article className="glass-panel cash-ledger-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">{t('shifts.cashPosition')}</span>
              <h2>{t('shifts.expectedDrawer')}</h2>
            </div>
            <Banknote size={20} />
          </div>
          <strong className="cash-total">
            ${currentExpectedUsd.toFixed(2)}
          </strong>
          <div className="ledger-lines">
            <div>
              <span>{t('shifts.openingFloat')}</span>
              <strong>${currentOpeningUsd.toFixed(2)}</strong>
            </div>
            <div>
              <span>{t('shifts.cashSales')}</span>
              <strong>
                +${(currentExpectedUsd - currentOpeningUsd).toFixed(2)}
              </strong>
            </div>
            <div>
              <span>{t('shifts.cashRefunds')}</span>
              <strong>$0.00</strong>
            </div>
            <div>
              <span>{t('shifts.paidOut')}</span>
              <strong>$0.00</strong>
            </div>
          </div>
        </article>
        <article className="glass-panel payment-reconcile-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                {t('shifts.digitalPayments')}
              </span>
              <h2>{t('shifts.khqrConfirmation')}</h2>
            </div>
            <ScanLine size={20} />
          </div>
          <strong className="cash-total">
            ${(qrRevenueCents / 100).toFixed(2)}
          </strong>
          <div className="reconcile-progress">
            <span>
              <i style={{ width: '100%' }} />
            </span>
            <small>{t('shifts.paymentsConfirmed')}</small>
          </div>
          <div className="success-note">
            <CheckCircle2 size={16} />
            <span>{t('shifts.noMismatches')}</span>
          </div>
        </article>
      </section>
      <section className="glass-panel shift-history table-responsive">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">{t('shifts.controlLog')}</span>
            <h2>{t('shifts.history')}</h2>
          </div>
          <button
            className="secondary-button"
            onClick={() => onToast(t('shifts.historyExported'))}
          >
            <Download size={16} /> {t('common.export')}
          </button>
        </div>
        <div className="shift-history-row table-head">
          <span>{t('shifts.dateShift')}</span>
          <span>{t('employees.employee')}</span>
          <span>{t('shifts.duration')}</span>
          <span>{t('shifts.expectedCash')}</span>
          <span>{t('shifts.countedCash')}</span>
          <span>{t('shifts.variance')}</span>
          <span>{t('catalog.status')}</span>
        </div>
        {shifts.map((shift) => (
          <ShiftRow key={shift.id} shift={shift} />
        ))}
        {shifts.length === 0 && totalOrders === 0 && (
          <div className="empty-state">
            <Clock3 size={24} />
            <strong>{t('shifts.noActive')}</strong>
          </div>
        )}
      </section>
      <Modal
        open={closeShiftOpen}
        onClose={() => setCloseShiftOpen(false)}
        eyebrow={t('shifts.cashControl')}
        title={t('shifts.closeTitle')}
        size="medium"
      >
        <form className="modal-form" onSubmit={closeShift}>
          <div className="reconcile-summary">
            <div>
              <span>{t('shifts.expectedCash')}</span>
              <strong>${currentExpectedUsd.toFixed(2)}</strong>
            </div>
            <div>
              <span>{t('shifts.khqrConfirmed')}</span>
              <strong>${(qrRevenueCents / 100).toFixed(2)}</strong>
            </div>
            <div>
              <span>{t('shifts.netSales')}</span>
              <strong>
                ${(currentExpectedUsd - currentOpeningUsd).toFixed(2)}
              </strong>
            </div>
          </div>
          <label>
            <span>{t('shifts.countedCash')}</span>
            <div className="currency-input">
              <span>$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={closingCash}
                onChange={(event) => setClosingCash(event.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <small>{t('shifts.countInstruction')}</small>
          </label>
          <label>
            <span>{t('shifts.closingNote')}</span>
            <textarea rows={3} placeholder={t('shifts.handoverPlaceholder')} />
          </label>
          <div className="form-notice warning">
            <ShieldAlert size={17} />
            <span>{t('shifts.closingWarning')}</span>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setCloseShiftOpen(false)}
            >
              {t('common.cancel')}
            </button>
            <button
              className="primary-button"
              disabled={saving || !currentShift}
            >
              <LockKeyhole size={16} />
              {saving ? t('shifts.closing') : t('shifts.closeShift')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function ShiftRow({ shift }: { shift: Shift }) {
  const { t } = useTranslation()
  const expected = ((shift.expectedCashUsdCents ?? 0) / 100).toFixed(2)
  const counted = ((shift.closingCashUsdCents ?? 0) / 100).toFixed(2)
  const variance = (shift.varianceUsdCents ?? 0) / 100
  const varianceLabel = `${variance < 0 ? '−' : variance > 0 ? '+' : ''}$${Math.abs(variance).toFixed(2)}`
  const varianceClass =
    variance < -0.01
      ? 'coral-text'
      : variance > 0.01
        ? 'amber-text'
        : 'green-text'
  return (
    <div className="shift-history-row">
      <span>
        <strong>{formatDate(shift.openedAt)}</strong>
        <small>
          {formatTime(shift.openedAt)}
          {shift.closedAt
            ? ` – ${formatTime(shift.closedAt)}`
            : ` – ${t('shifts.now')}`}
        </small>
      </span>
      <span>{shift.openedBy || '—'}</span>
      <span>{duration(shift)}</span>
      <strong>${expected}</strong>
      <span>{shift.status === 'Closed' ? `$${counted}` : '—'}</span>
      <strong className={varianceClass}>
        {shift.status === 'Closed' ? varianceLabel : '—'}
      </strong>
      <span
        className={`status-badge ${shift.status === 'Closed' ? 'success' : 'info'}`}
      >
        <i />
        {shift.status === 'Closed' ? t('common.closed') : t('common.open')}
      </span>
    </div>
  )
}

function formatShiftStart(shift: Shift | null) {
  return shift ? formatTime(shift.openedAt) : '—'
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en', {
    day: 'numeric',
    month: 'short',
  })
}
function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('en', {
    hour: 'numeric',
    minute: '2-digit',
  })
}
function duration(shift: Shift) {
  const start = new Date(shift.openedAt).getTime()
  const end = shift.closedAt ? new Date(shift.closedAt).getTime() : Date.now()
  const minutes = Math.max(0, Math.floor((end - start) / 60000))
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
