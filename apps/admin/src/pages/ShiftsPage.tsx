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
import { downloadCsv } from '../lib/exports'
import type { Shift } from '../data'

export default function ShiftsPage({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const { t } = useTranslation()
  const { shifts, currentShift, summary, refresh } = useAdminData()
  const qrRevenueCents = summary?.qrRevenueCents ?? 0
  const qrPaymentCount = summary?.qrPaymentCount ?? 0
  const openShiftCount = shifts.filter(
    (shift) => shift.status === 'Open',
  ).length
  const [closeShiftOpen, setCloseShiftOpen] = useState(false)
  const [closingCash, setClosingCash] = useState('')
  const [closingCashKhr, setClosingCashKhr] = useState('')
  const [saving, setSaving] = useState(false)
  const closeShift = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await apiRequest('/api/shifts/close', {
        method: 'POST',
        body: JSON.stringify({
          closingCash: Number(closingCash || 0),
          closingCashKhr: Number(closingCashKhr.replace(/[^0-9]/g, '') || 0),
        }),
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
  const currentExpectedKhr = currentShift?.expectedCashKhr ?? 0
  const currentOpeningKhr = currentShift?.openingCashKhr ?? 0
  const totalOrders = shifts.reduce((sum, shift) => sum + (shift.id ? 1 : 0), 0)
  const exportHistory = () => {
    downloadCsv(
      'shift-history.csv',
      [
        'Opened',
        'Closed',
        'Opened by',
        'Opening cash (USD)',
        'Expected cash (USD)',
        'Counted cash (USD)',
        'Variance (USD)',
        'Status',
      ],
      shifts.map((shift) => [
        new Date(shift.openedAt).toLocaleString(),
        shift.closedAt ? new Date(shift.closedAt).toLocaleString() : '',
        shift.openedBy || '',
        ((shift.openingCashUsdCents ?? 0) / 100).toFixed(2),
        ((shift.expectedCashUsdCents ?? 0) / 100).toFixed(2),
        shift.closedAt
          ? ((shift.closingCashUsdCents ?? 0) / 100).toFixed(2)
          : '',
        shift.closedAt ? ((shift.varianceUsdCents ?? 0) / 100).toFixed(2) : '',
        shift.status,
      ]),
    )
    onToast(t('shifts.historyExported'))
  }
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
              <Clock3 size={15} />{' '}
              {currentShift
                ? t('shifts.openedBy', {
                    name: currentShift.openedBy || '—',
                  })
                : t('shifts.noActive')}
            </span>
          </div>
          <div className="shift-staff-row">
            <span className="employee-avatar e1">
              {initials(currentShift?.openedBy || '')}
            </span>
            <div>
              <strong>
                {t('shifts.cashiersActive', { count: openShiftCount })}
              </strong>
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
              <strong>
                ${currentOpeningUsd.toFixed(2)} · ៛
                {currentOpeningKhr.toLocaleString()}
              </strong>
            </div>
            <div>
              <span>{t('shifts.cashSales')}</span>
              <strong>
                +${(currentExpectedUsd - currentOpeningUsd).toFixed(2)} · ៛
                {(currentExpectedKhr - currentOpeningKhr).toLocaleString()}
              </strong>
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
              <i
                style={{
                  width: qrPaymentCount > 0 ? '100%' : '0%',
                }}
              />
            </span>
            <small>
              {qrPaymentCount > 0
                ? t('shifts.paymentsConfirmed', {
                    count: qrPaymentCount,
                    total: qrPaymentCount,
                  })
                : t('shifts.noPayments')}
            </small>
          </div>
          <div className="success-note">
            <CheckCircle2 size={16} />
            <span>
              {qrPaymentCount > 0
                ? t('shifts.noMismatches')
                : t('shifts.noPayments')}
            </span>
          </div>
        </article>
      </section>
      <section className="glass-panel shift-history table-responsive">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">{t('shifts.controlLog')}</span>
            <h2>{t('shifts.history')}</h2>
          </div>
          <button className="secondary-button" onClick={exportHistory}>
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
              <strong>
                ${currentExpectedUsd.toFixed(2)} · ៛
                {currentExpectedKhr.toLocaleString()}
              </strong>
            </div>
            <div>
              <span>{t('shifts.khqrConfirmed')}</span>
              <strong>${(qrRevenueCents / 100).toFixed(2)}</strong>
            </div>
            <div>
              <span>{t('shifts.netSales')}</span>
              <strong>
                ${(currentExpectedUsd - currentOpeningUsd).toFixed(2)} · ៛
                {(currentExpectedKhr - currentOpeningKhr).toLocaleString()}
              </strong>
            </div>
          </div>
          <div className="form-grid two-columns">
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
              <span>{t('shifts.countedCashKhr')}</span>
              <div className="currency-input">
                <span>៛</span>
                <input
                  inputMode="numeric"
                  min="0"
                  step="100"
                  value={closingCashKhr}
                  onChange={(event) => setClosingCashKhr(event.target.value)}
                  placeholder="0"
                />
              </div>
              <small>{t('shifts.countInstructionKhr')}</small>
            </label>
          </div>
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
  const varianceKhr = shift.varianceKhr ?? 0
  const varianceLabel = `${variance < 0 ? '−' : variance > 0 ? '+' : ''}$${Math.abs(variance).toFixed(2)}${shift.status === 'Closed' ? ` · ៛${varianceKhr.toLocaleString()}` : ''}`
  const varianceClass =
    variance < -0.01 || varianceKhr < -50
      ? 'coral-text'
      : variance > 0.01 || varianceKhr > 50
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
      <strong>
        ${expected}
        {shift.expectedCashKhr ? (
          <small className="khr-sub">· ៛{shift.expectedCashKhr.toLocaleString()}</small>
        ) : null}
      </strong>
      <span>
        {shift.status === 'Closed' ? `$${counted}` : '—'}
        {shift.status === 'Closed' && shift.closingCashKhr ? (
          <small className="khr-sub">· ៛{shift.closingCashKhr.toLocaleString()}</small>
        ) : null}
      </span>
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
