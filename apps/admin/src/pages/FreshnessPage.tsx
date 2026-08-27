import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  Plus,
  Trash2,
} from 'lucide-react'
import { useAdminData } from '../lib/data'
import Modal from '../components/Modal'
import { useTranslation } from '../lib/i18n'
import type { Product } from '../data'

type Props = { onToast: (message: string) => void }
export default function FreshnessPage({ onToast }: Props) {
  const { t } = useTranslation()
  const { products, freshness, recordWaste } = useAdminData()
  const [wasteModal, setWasteModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('queue')
  const tabs = [
    { id: 'queue', label: 'freshness.queue' },
    { id: 'waste', label: 'freshness.wasteLog' },
    { id: 'batches', label: 'freshness.batches' },
  ]
  const stats = freshness
  const freshUnits = stats?.freshUnits ?? 0
  const freshPercent = stats?.freshPercent ?? 0
  const expiresTodayUnits = stats?.expiresTodayUnits ?? 0
  const expiresTodayValue = (stats?.expiresTodayValueCents ?? 0) / 100
  const expiresTomorrowUnits = stats?.expiresTomorrowUnits ?? 0
  const expiresTomorrowValue = (stats?.expiresTomorrowValueCents ?? 0) / 100
  const wasteWeek = (stats?.wasteThisWeekCents ?? 0) / 100
  const wasteDelta = stats?.wasteDeltaPercent ?? null
  const lastRecordedAt = stats?.lastRecordedAt
    ? new Date(stats.lastRecordedAt)
    : null
  const updatedLabel = lastRecordedAt
    ? t('freshness.updated', { time: timeAgo(lastRecordedAt) })
    : t('freshness.updatedJustNow')
  const events = stats?.events ?? []
  const submitWaste = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const productId = Number(form.get('productId'))
    const quantity = Number(form.get('quantity'))
    const reason = String(form.get('reason') || 'expired')
    const note = String(form.get('note') || '')
    if (!productId || quantity < 1) return
    setSaving(true)
    try {
      await recordWaste({ productId, quantity, reason, note })
      setWasteModal(false)
      onToast(t('freshness.wasteSaved'))
    } catch (reason) {
      onToast(
        reason instanceof Error ? reason.message : t('freshness.wasteFailed'),
      )
    } finally {
      setSaving(false)
    }
  }
  const exportReport = () => {
    const rows = events.map((event) => [
      event.recordedAt,
      event.productName,
      event.quantity,
      event.reason,
      event.retailValue.toFixed(2),
      event.recordedBy || '',
    ])
    const content = [
      ['Date', 'Product', 'Quantity', 'Reason', 'Retail value', 'Recorded by'],
      ...rows,
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(
      new Blob(['\uFEFF' + content], {
        type: 'text/csv;charset=utf-8;',
      }),
    )
    link.download = 'freshness-waste-log.csv'
    link.click()
    URL.revokeObjectURL(link.href)
    onToast(t('freshness.reportExported'))
  }
  return (
    <div className="page-content">
      <section className="freshness-hero glass-panel">
        <div className="freshness-hero-copy">
          <span className="section-kicker">{t('freshness.fefo')}</span>
          <h2>{t('freshness.protect')}</h2>
          <p>{t('freshness.description')}</p>
          <div>
            <button
              className="primary-button"
              onClick={() => setWasteModal(true)}
            >
              <Plus size={17} /> {t('freshness.recordWaste')}
            </button>
            <button className="secondary-button" onClick={exportReport}>
              <Download size={16} /> {t('freshness.exportReport')}
            </button>
          </div>
        </div>
        <div className="freshness-score">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="48" />
            <circle
              className="score-progress"
              cx="60"
              cy="60"
              r="48"
              style={{
                strokeDasharray: `${
                  (freshPercent / 100) * 2 * Math.PI * 48
                } ${2 * Math.PI * 48}`,
              }}
            />
          </svg>
          <div>
            <strong>{freshPercent}%</strong>
            <span>{t('freshness.score')}</span>
          </div>
          <small>
            <CheckCircle2 size={14} />{' '}
            {freshPercent >= 90
              ? t('freshness.healthy')
              : freshUnits > 0
                ? t('freshness.needsAttention')
                : t('freshness.noInventory')}
          </small>
        </div>
      </section>
      <section className="kpi-grid compact-kpis freshness-kpis">
        <article className="mini-kpi glass-panel">
          <span>{t('freshness.freshSellable')}</span>
          <strong>
            {freshUnits} {t('common.units')}
          </strong>
          <small className="green-text">
            {t('freshness.inventoryPercent', { percent: freshPercent })}
          </small>
        </article>
        <article className="mini-kpi glass-panel">
          <span>{t('freshness.expiresToday')}</span>
          <strong className="coral-text">
            {expiresTodayUnits} {t('common.units')}
          </strong>
          <small>
            ${expiresTodayValue.toFixed(2)}{' '}
            {t('catalog.retailValue', { value: '' }).replace('$', '').trim()}
          </small>
        </article>
        <article className="mini-kpi glass-panel">
          <span>{t('freshness.expiresTomorrow')}</span>
          <strong className="amber-text">
            {expiresTomorrowUnits} {t('common.units')}
          </strong>
          <small>
            ${expiresTomorrowValue.toFixed(2)}{' '}
            {t('catalog.retailValue', { value: '' }).replace('$', '').trim()}
          </small>
        </article>
        <article className="mini-kpi glass-panel">
          <span>{t('freshness.wasteWeek')}</span>
          <strong>${wasteWeek.toFixed(2)}</strong>
          <small className="green-text">
            {wasteDelta === null
              ? t('freshness.noLastWeek')
              : t('freshness.lastWeek', { delta: wasteDelta })}
          </small>
        </article>
      </section>
      <section className="filter-tabs standalone-tabs">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
          >
            {t(item.label)}
          </button>
        ))}
      </section>
      {tab === 'queue' && (
        <section className="glass-panel freshness-table table-responsive">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                {t('freshness.priorityList')}
              </span>
              <h2>{t('freshness.sellFirst')}</h2>
            </div>
            <span className="queue-updated">
              <i /> {updatedLabel}
            </span>
          </div>
          <div className="freshness-row freshness-head">
            <span>{t('freshness.priority')}</span>
            <span>{t('freshness.productBatch')}</span>
            <span>{t('freshness.made')}</span>
            <span>{t('catalog.bestBeforeLabel')}</span>
            <span>{t('freshness.onHand')}</span>
            <span>{t('freshness.valueRisk')}</span>
            <span>{t('freshness.action')}</span>
          </div>
          {[...products]
            .sort((a, b) => priority(a.status) - priority(b.status))
            .map((product, index) => (
              <div className="freshness-row" key={product.id}>
                <span className={`priority-number p${Math.min(index + 1, 4)}`}>
                  {index + 1}
                </span>
                <div className="catalog-product">
                  <span
                    className="catalog-image"
                    style={{ backgroundPosition: product.imagePosition }}
                  />
                  <div>
                    <strong>{product.name}</strong>
                    <small>{skuLabel(t, product)}</small>
                  </div>
                </div>
                <span>{shortDate(product.madeAt)}</span>
                <span>
                  <strong>{shortDate(product.bestBefore)}</strong>
                  <small
                    className={`block-note ${product.status === 'Expires today' ? 'coral-text' : ''}`}
                  >
                    {statusLabel(t, product.status)}
                  </small>
                </span>
                <strong>
                  {product.stock} {t('common.units')}
                </strong>
                <strong>${(product.stock * product.price).toFixed(2)}</strong>
                {product.status === 'Expired' && (
                  <button
                    className="text-button coral-text"
                    onClick={() => setWasteModal(true)}
                  >
                    {t('freshness.writeOff')} <ChevronRight size={15} />
                  </button>
                )}
              </div>
            ))}
        </section>
      )}
      {tab === 'waste' && (
        <section className="glass-panel simple-data-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                {t('freshness.recordedLoss')}
              </span>
              <h2>{t('freshness.wasteLog')}</h2>
            </div>
            <button
              className="primary-button"
              onClick={() => setWasteModal(true)}
            >
              <Plus size={16} /> {t('freshness.recordWaste')}
            </button>
          </div>
          <div className="waste-log-row table-head">
            <span>{t('freshness.date')}</span>
            <span>{t('dashboard.product')}</span>
            <span>{t('freshness.quantity')}</span>
            <span>{t('freshness.reason')}</span>
            <span>{t('freshness.costImpact')}</span>
            <span>{t('freshness.recordedBy')}</span>
          </div>
          {events.map((event) => (
            <div className="waste-log-row" key={event.id}>
              <span>
                {new Date(event.recordedAt).toLocaleString('en', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
              <strong>{event.productName}</strong>
              <span>
                {event.quantity} {t('common.units')}
              </span>
              <span className="reason-pill">
                {reasonLabel(t, event.reason)}
              </span>
              <strong>${event.retailValue.toFixed(2)}</strong>
              <span>{event.recordedBy || '—'}</span>
            </div>
          ))}
          {events.length === 0 && (
            <div className="empty-state">
              <CheckCircle2 size={24} />
              <strong>{t('freshness.noWasteRecorded')}</strong>
            </div>
          )}
        </section>
      )}
      {tab === 'batches' && (
        <section className="batch-grid">
          {products.slice(0, 4).map((product) => (
            <article className="glass-panel batch-card" key={product.id}>
              <div>
                <span
                  className="catalog-image"
                  style={{ backgroundPosition: product.imagePosition }}
                />
                <span
                  className={`freshness-badge ${product.status === 'Fresh' ? 'fresh' : 'warning'}`}
                >
                  {statusLabel(t, product.status)}
                </span>
              </div>
              <span>{skuLabel(t, product)}</span>
              <h3>{product.name}</h3>
              <dl>
                <div>
                  <dt>{t('freshness.produced')}</dt>
                  <dd>{shortDate(product.madeAt)}</dd>
                </div>
                <div>
                  <dt>{t('freshness.initialYield')}</dt>
                  <dd>
                    {product.stock + product.sold} {t('common.units')}
                  </dd>
                </div>
                <div>
                  <dt>{t('freshness.sold')}</dt>
                  <dd>
                    {product.sold} {t('common.units')}
                  </dd>
                </div>
                <div>
                  <dt>{t('freshness.remaining')}</dt>
                  <dd>
                    {product.stock} {t('common.units')}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </section>
      )}
      <Modal
        open={wasteModal}
        onClose={() => setWasteModal(false)}
        eyebrow={t('freshness.inventoryAdjustment')}
        title={t('freshness.recordWasteTitle')}
        size="small"
      >
        <form className="modal-form" onSubmit={submitWaste}>
          <div className="form-grid">
            <label>
              <span>{t('freshness.productBatch')}</span>
              <select name="productId" required defaultValue="">
                <option value="" disabled>
                  {t('freshness.selectProduct')}
                </option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid two-columns">
              <label>
                <span>{t('freshness.quantity')}</span>
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  defaultValue="1"
                  required
                />
              </label>
              <label>
                <span>{t('freshness.reason')}</span>
                <select name="reason" defaultValue="expired">
                  <option value="expired">{t('dashboard.expiresToday')}</option>
                  <option value="damaged">{t('freshness.damaged')}</option>
                  <option value="quality">{t('freshness.qualityIssue')}</option>
                  <option value="staff_meal">{t('freshness.staffMeal')}</option>
                </select>
              </label>
            </div>
            <label>
              <span>{t('freshness.noteOptional')}</span>
              <textarea
                name="note"
                placeholder={t('freshness.auditContext')}
                rows={3}
              />
            </label>
          </div>
          <div className="form-notice warning">
            <AlertTriangle size={17} />
            <span>{t('freshness.wasteWarning')}</span>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setWasteModal(false)}
            >
              {t('common.cancel')}
            </button>
            <button className="primary-button" disabled={saving}>
              <Trash2 size={16} /> {t('freshness.recordWaste')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
function priority(status: string) {
  return status === 'Expires today'
    ? 0
    : status === '1 day left'
      ? 1
      : status === 'Fresh'
        ? 2
        : 3
}
function statusLabel(
  t: (key: string, variables?: Record<string, string | number>) => string,
  status: string,
) {
  return status === 'Fresh'
    ? t('dashboard.freshStatus')
    : status === '1 day left'
      ? t('dashboard.oneDayLeft')
      : status === 'Expires today'
        ? t('dashboard.expiresToday')
        : t('catalog.expired')
}
function reasonLabel(
  t: (key: string, variables?: Record<string, string | number>) => string,
  reason: string,
) {
  switch (reason) {
    case 'damaged':
      return t('freshness.damaged')
    case 'quality':
      return t('freshness.qualityIssue')
    case 'staff_meal':
      return t('freshness.staffMeal')
    default:
      return t('dashboard.expiresToday')
  }
}
function skuLabel(
  t: (key: string, variables?: Record<string, string | number>) => string,
  product: Product,
) {
  return t('catalog.sku', { id: String(product.id).padStart(3, '0') })
}
function shortDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
  })
}
function timeAgo(value: Date) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - value.getTime()) / 60000),
  )
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}
