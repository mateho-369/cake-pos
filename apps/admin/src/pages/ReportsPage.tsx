import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  FileText,
  Lightbulb,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react'
import type { RevenuePoint } from '../data'
import { useAdminData } from '../lib/data'
import { apiRequest } from '../lib/api'
import { translateCategory, useTranslation } from '../lib/i18n'
import {
  downloadCsv,
  exportOrdersExcel,
  exportSummaryWord,
  ordersInRange,
} from '../lib/exports'

export default function ReportsPage({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const { t } = useTranslation()
  const {
    categories,
    products,
    revenueData,
    orders,
    summary,
    freshness,
    shifts,
    employees,
  } = useAdminData()
  const kpiNetSales = summary?.todaySalesTotal ?? 0
  const kpiAverageOrder = (summary?.averageOrderValueCents ?? 0) / 100
  const kpiOrders = summary?.todayOrdersCount ?? orders.length
  const kpiWaste = (freshness?.wasteThisWeekCents ?? 0) / 100
  const wasteShareOfSales =
    kpiNetSales > 0 ? (kpiWaste / kpiNetSales) * 100 : null
  const totalCategoryRevenue = categories.reduce(
    (sum, category) => sum + category.revenue,
    0,
  )
  const totalProductRevenue = products.reduce(
    (sum, product) => sum + product.revenue,
    0,
  )
  // Owner insight is computed from the real revenue series and the real
  // top-selling product; there is no static marketing copy left on this page.
  const bestDay = revenueData.reduce<RevenuePoint | null>(
    (best, point) => (point.value > (best?.value ?? 0) ? point : best),
    null,
  )
  const otherDays = revenueData.filter((point) => point !== bestDay)
  const otherAverage = otherDays.length
    ? otherDays.reduce((sum, point) => sum + point.value, 0) / otherDays.length
    : 0
  const bestDayDelta =
    bestDay && otherAverage > 0
      ? ((bestDay.value - otherAverage) / otherAverage) * 100
      : null
  const topProduct = summary?.topProducts?.[0]
  const hasInsight = Boolean(bestDay && bestDay.value > 0)
  const [tab, setTab] = useState('sales')
  const today = localIsoDate(new Date())
  const [from, setFrom] = useState(today.slice(0, 8) + '01')
  const [to, setTo] = useState(today)
  const selectedOrders = ordersInRange(orders, from, to)
  const applyPreset = (preset: string) => {
    const range = rangeForPreset(preset)
    setFrom(range.from)
    setTo(range.to)
  }
  const tabs = [
    { id: 'sales', label: 'reports.sales' },
    { id: 'products', label: 'reports.products' },
    { id: 'payments', label: 'reports.payments' },
    { id: 'team', label: 'reports.team' },
    { id: 'waste', label: 'reports.waste' },
    { id: 'losses', label: 'reports.losses' },
    { id: 'audit', label: 'reports.auditLog' },
  ]
  const presets = [
    { id: 'today', label: 'reports.today' },
    { id: 'yesterday', label: 'reports.yesterday' },
    { id: 'this_week', label: 'reports.thisWeek' },
    { id: 'this_month', label: 'reports.thisMonth' },
    { id: 'last_month', label: 'reports.lastMonth' },
    { id: 'this_year', label: 'reports.thisYear' },
  ]
  const libraries = [
    { key: 'dailySummary', label: 'reports.dailySummary' },
    { key: 'sellThrough', label: 'reports.sellThrough' },
    { key: 'reconciliation', label: 'reports.reconciliation' },
    { key: 'shiftVariance', label: 'reports.shiftVariance' },
    { key: 'freshWaste', label: 'reports.freshWaste' },
    { key: 'employeePerformance', label: 'reports.employeePerformance' },
  ]
  // Each library item downloads a report that matches its label, built from
  // the same live data shown elsewhere in the admin app.
  const runLibraryExport = (key: string, label: string) => {
    onToast(t('reports.prepared', { name: t(label) }))
    const run = (): Promise<void> | void => {
      switch (key) {
        case 'dailySummary':
          return exportSummaryWord(selectedOrders, from, to)
        case 'sellThrough':
          downloadCsv(
            `product-sell-through-${from || 'all'}-${to || 'all'}.csv`,
            ['Product', 'Category', 'Sold', 'On hand', 'Sell-through %'],
            products.map((product) => {
              const total = product.sold + product.stock
              return [
                product.name,
                product.category,
                product.sold,
                product.stock,
                total ? Math.round((product.sold / total) * 100) : 0,
              ]
            }),
          )
          return
        case 'reconciliation':
          downloadCsv(
            `payment-reconciliation-${from || 'all'}-${to || 'all'}.csv`,
            ['Order', 'Date', 'Payment', 'Status', 'Total (USD)'],
            selectedOrders.map((order) => [
              order.id,
              new Date(order.createdAt).toLocaleDateString('en-CA'),
              order.payment || 'Unpaid',
              order.status,
              order.total.toFixed(2),
            ]),
          )
          return
        case 'shiftVariance':
          downloadCsv(
            'shift-variance.csv',
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
              shift.closedAt
                ? ((shift.varianceUsdCents ?? 0) / 100).toFixed(2)
                : '',
              shift.status,
            ]),
          )
          return
        case 'freshWaste':
          downloadCsv(
            'freshness-waste.csv',
            [
              'Date',
              'Product',
              'Quantity',
              'Reason',
              'Retail value (USD)',
              'Recorded by',
            ],
            (freshness?.events ?? []).map((event) => [
              new Date(event.recordedAt).toLocaleString(),
              event.productName,
              event.quantity,
              event.reason,
              event.retailValue.toFixed(2),
              event.recordedBy || '',
            ]),
          )
          return
        case 'employeePerformance':
          downloadCsv(
            'employee-performance.csv',
            ['Employee', 'Role', 'Orders', 'Sales today (USD)'],
            employees.map((employee) => [
              employee.name,
              employee.role,
              employee.orders,
              employee.sales.toFixed(2),
            ]),
          )
          return
        default:
          return exportOrdersExcel(selectedOrders, from, to)
      }
    }
    Promise.resolve(run()).catch((error) =>
      onToast(error instanceof Error ? error.message : String(error)),
    )
  }
  return (
    <div className="page-content">
      <section className="reports-header">
        <div className="filter-tabs report-tabs">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? 'active' : ''}
              onClick={() => setTab(item.id)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
        <div className="toolbar-actions report-export-actions">
          <div className="report-presets">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="text-button"
                onClick={() => applyPreset(preset.id)}
              >
                {t(preset.label)}
              </button>
            ))}
          </div>
          <label>
            {t('reports.from')}
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            {t('reports.to')}
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            onClick={() =>
              void exportSummaryWord(selectedOrders, from, to)
                .then(() => onToast('Word report exported'))
                .catch((error) => onToast(error.message))
            }
          >
            <FileText size={16} /> Word
          </button>
          <button
            className="primary-button"
            onClick={() =>
              void exportOrdersExcel(selectedOrders, from, to)
                .then(() => onToast('Excel workbook exported'))
                .catch((error) => onToast(error.message))
            }
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
        </div>
      </section>
      <section className="report-kpi-row">
        <ReportKpi
          label={t('dashboard.netSales')}
          value={`$${kpiNetSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          detail={t('dashboard.today')}
        />
        <ReportKpi
          label={t('dashboard.averageOrder')}
          value={`$${kpiAverageOrder.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          detail={t('reports.averageDetail', {
            amount: kpiAverageOrder.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
          })}
        />
        <ReportKpi
          label={t('dashboard.orders')}
          value={String(kpiOrders)}
          detail={t('reports.completedOrders')}
        />
        <ReportKpi
          label={t('reports.waste')}
          value={`$${kpiWaste.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          detail={
            wasteShareOfSales === null
              ? t('reports.noWasteShare')
              : t('reports.netSalesPercent', {
                  percent: wasteShareOfSales.toFixed(1),
                })
          }
        />
      </section>
      <section className="report-main-grid">
        <div className="glass-panel report-chart-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">{t('reports.trend')}</span>
              <h2>{tabTitle(t, tab)}</h2>
            </div>
            {(tab === 'sales' || tab === 'waste') && (
              <div className="dual-legend">
                <span>
                  <i className="sales" />
                  {tab === 'waste'
                    ? t('reports.wasteCost')
                    : t('reports.sales')}
                </span>
              </div>
            )}
          </div>
          {tab === 'sales' && <ComparisonChart waste={false} />}
          {tab === 'waste' && <ComparisonChart waste />}
          {tab === 'products' && <TopProductsTable />}
          {tab === 'payments' && <PaymentsBreakdown />}
          {tab === 'team' && <TeamAccountability from={from} to={to} />}
          {tab === 'audit' && (
            <AuditLogPanel from={from} to={to} onToast={onToast} />
          )}
          {tab === 'losses' && <LossesPanel from={from} to={to} />}
        </div>
        <div className="glass-panel insight-panel">
          <div className="insight-icon">
            <Lightbulb size={20} />
          </div>
          <span className="section-kicker">{t('reports.ownerInsight')}</span>
          {hasInsight && bestDay ? (
            <>
              <h2>
                {t('reports.opportunity', {
                  day: dayName(bestDay.day),
                })}
              </h2>
              <p>
                {bestDayDelta !== null
                  ? t('reports.opportunityText', {
                      day: dayName(bestDay.day),
                      delta: bestDayDelta.toFixed(1),
                      product: topProduct?.name || t('reports.topProduct'),
                    })
                  : t('reports.opportunityNoDelta', {
                      day: dayName(bestDay.day),
                    })}
              </p>
              <div className="insight-metric">
                <TrendingUp size={18} />
                <div>
                  <strong>{t('reports.recommended')}</strong>
                  <span>
                    {t('reports.recommendedText', {
                      day: dayName(bestDay.day),
                      product: topProduct?.name || t('reports.topProduct'),
                      units:
                        topProduct && topProduct.units > 0
                          ? String(topProduct.units)
                          : '—',
                    })}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p>{t('reports.noInsight')}</p>
          )}
        </div>
      </section>
      <PeriodComparison from={from} to={to} />
      <section className="report-bottom-grid">
        <div className="glass-panel category-report">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                {t('reports.contribution')}
              </span>
              <h2>{t('reports.salesCategory')}</h2>
            </div>
            <button className="text-button" onClick={() => setTab('products')}>
              {t('common.viewBreakdown')}
            </button>
          </div>
          <div className="category-report-list">
            {categories.map((category, index) => {
              const share = totalCategoryRevenue
                ? (category.revenue / totalCategoryRevenue) * 100
                : 0
              return (
                <div key={translateCategory(t, category.name)}>
                  <span className="rank">{index + 1}</span>
                  <div>
                    <strong>{translateCategory(t, category.name)}</strong>
                    <i>
                      <b
                        style={{
                          width: `${Math.min(100, share)}%`,
                          background: category.color,
                        }}
                      />
                    </i>
                  </div>
                  <span>
                    <strong>${category.revenue.toLocaleString()}</strong>
                    <small>{Math.round(share)}%</small>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="glass-panel margin-report">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                {t('reports.menuEngineering')}
              </span>
              <h2>{t('reports.profitability')}</h2>
            </div>
          </div>
          <div className="margin-row table-head">
            <span>{t('dashboard.product')}</span>
            <span>{t('dashboard.revenue')}</span>
            <span>{t('reports.margin')}</span>
          </div>
          {products.slice(0, 5).map((product) => {
            const share = totalProductRevenue
              ? (product.revenue / totalProductRevenue) * 100
              : 0
            return (
              <div className="margin-row" key={product.id}>
                <div className="catalog-product">
                  <span
                    className="catalog-image small"
                    style={{ backgroundPosition: product.imagePosition }}
                  />
                  <strong>{product.name}</strong>
                </div>
                <strong>${product.revenue}</strong>
                <span className="margin-pill">{Math.round(share)}%</span>
              </div>
            )
          })}
        </div>
      </section>
      <section className="glass-panel report-library">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">{t('reports.downloads')}</span>
            <h2>{t('reports.library')}</h2>
          </div>
        </div>
        <div className="report-library-grid">
          {libraries.map((item) => (
            <button
              key={item.key}
              onClick={() => runLibraryExport(item.key, item.label)}
            >
              <FileSpreadsheet size={19} />
              <span>
                <strong>{t(item.label)}</strong>
                <small>{t('reports.updatedNow')}</small>
              </span>
              <Download size={16} />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
const cents = (value: number) => `$${(value / 100).toFixed(2)}`

function tabTitle(t: (key: string) => string, tab: string) {
  switch (tab) {
    case 'waste':
      return t('reports.wasteTrend')
    case 'products':
      return t('reports.productsTitle')
    case 'payments':
      return t('reports.paymentsTitle')
    case 'team':
      return t('reports.teamTitle')
    case 'losses':
      return t('reports.lossesTitle')
    default:
      return t('reports.salesTrend')
  }
}

function localIsoDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function rangeForPreset(preset: string): { from: string; to: string } {
  const now = new Date()
  const today = localIsoDate(now)
  const y = now.getFullYear()
  const m = now.getMonth()
  const iso = (year: number, month: number, day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  switch (preset) {
    case 'yesterday': {
      const d = new Date(now)
      d.setDate(d.getDate() - 1)
      const day = localIsoDate(d)
      return { from: day, to: day }
    }
    case 'this_week': {
      const d = new Date(now)
      const weekday = d.getDay()
      const mondayOffset = weekday === 0 ? 6 : weekday - 1
      d.setDate(d.getDate() - mondayOffset)
      return { from: localIsoDate(d), to: today }
    }
    case 'this_month':
      return { from: iso(y, m, 1), to: today }
    case 'last_month': {
      const last = new Date(y, m, 0)
      return {
        from: iso(last.getFullYear(), last.getMonth(), 1),
        to: localIsoDate(last),
      }
    }
    case 'this_year':
      return { from: `${y}-01-01`, to: today }
    default:
      return { from: today, to: today }
  }
}

type LossesReport = {
  wasteCents: number
  discountsCents: number
  voidsCents: number
  refundsCents: number
  cashShortagesCents: number
  totalLostCents: number
}

function LossesPanel({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation()
  const [data, setData] = useState<LossesReport | null>(null)
  useEffect(() => {
    let alive = true
    apiRequest<LossesReport>(`/api/reports/losses?from=${from}&to=${to}`)
      .then((row) => alive && setData(row))
      .catch(() => alive && setData(null))
    return () => {
      alive = false
    }
  }, [from, to])
  if (!data)
    return (
      <div className="empty-state">
        <span>{t('reports.loadingData')}</span>
      </div>
    )
  const rows = [
    { label: t('reports.waste'), value: data.wasteCents },
    { label: t('reports.discounts'), value: data.discountsCents },
    { label: t('reports.voids'), value: data.voidsCents },
    { label: t('reports.refunds'), value: data.refundsCents },
    { label: t('reports.cashShortages'), value: data.cashShortagesCents },
  ]
  return (
    <div className="report-tab-table table-responsive">
      <div className="table-row table-head">
        <span>{t('reports.losses')}</span>
        <span>{t('dashboard.revenue')}</span>
      </div>
      {rows.map((row) => (
        <div className="table-row" key={row.label}>
          <strong>{row.label}</strong>
          <strong className="numeric">{cents(row.value)}</strong>
        </div>
      ))}
      <div className="table-row">
        <strong>{t('reports.totalLost')}</strong>
        <strong className="numeric">{cents(data.totalLostCents)}</strong>
      </div>
      <button
        className="text-button"
        onClick={() =>
          downloadCsv(
            `losses-${from}-${to}.csv`,
            ['Category', 'USD'],
            [
              ...rows.map((row) => [row.label, (row.value / 100).toFixed(2)]),
              [t('reports.totalLost'), (data.totalLostCents / 100).toFixed(2)],
            ],
          )
        }
      >
        <Download size={14} /> {t('common.export')}
      </button>
    </div>
  )
}

function TopProductsTable() {
  const { t } = useTranslation()
  const { summary } = useAdminData()
  const top = summary?.topProducts ?? []
  if (!top.length)
    return (
      <div className="empty-state">
        <span>{t('reports.noChartData')}</span>
      </div>
    )
  return (
    <div className="report-tab-table table-responsive">
      <div className="table-row table-head">
        <span>#</span>
        <span>{t('dashboard.product')}</span>
        <span>{t('dashboard.units')}</span>
        <span>{t('dashboard.revenue')}</span>
      </div>
      {top.map((product, index) => (
        <div className="table-row" key={`${product.id}-${product.name}`}>
          <span className="rank">{index + 1}</span>
          <strong>{product.name}</strong>
          <span>{product.units}</span>
          <strong className="numeric">${product.revenue.toFixed(2)}</strong>
        </div>
      ))}
    </div>
  )
}

function PaymentsBreakdown() {
  const { t } = useTranslation()
  const { summary } = useAdminData()
  const cash = (summary?.cashRevenueCents ?? 0) / 100
  const qr = (summary?.qrRevenueCents ?? 0) / 100
  const qrCount = summary?.qrPaymentCount ?? 0
  const total = cash + qr
  if (!total)
    return (
      <div className="empty-state">
        <span>{t('reports.noChartData')}</span>
      </div>
    )
  const rows = [
    { label: t('dashboard.cash'), value: cash, count: null },
    { label: t('payment.khqr'), value: qr, count: qrCount },
  ]
  return (
    <div className="report-tab-table table-responsive">
      <div className="table-row table-head">
        <span>{t('reports.channel')}</span>
        <span>{t('dashboard.revenue')}</span>
        <span>{t('reports.share')}</span>
      </div>
      {rows.map((row) => (
        <div className="table-row" key={row.label}>
          <strong>
            {row.label}
            {row.count !== null && (
              <small className="block-note">
                {t('reports.confirmedPayments', { count: row.count })}
              </small>
            )}
          </strong>
          <strong className="numeric">${row.value.toFixed(2)}</strong>
          <span>{total ? Math.round((row.value / total) * 100) : 0}%</span>
        </div>
      ))}
    </div>
  )
}

type CashierAccountability = {
  cashier_id: number
  name: string
  completedOrderCount: number
  netRevenueCents: number
  discountsCents: number
  discountCount: number
  voidCount: number
  voidAmountCents: number
  refundCount: number
  refundAmountCents: number
  shiftsClosed: number
  shortfallCount: number
  repeatedShortfall: boolean
  varianceHistory: Array<{
    closedAt: string | null
    openingCashUsdCents: number
    expectedCashUsdCents: number
    closingCashUsdCents: number
    varianceUsdCents: number
  }>
}

/**
 * Employee accountability: normal sales numbers next to the anti-theft
 * signals (discounts, voids, refunds, cash-variance history). Rows with a
 * repeated negative-variance pattern are flagged for the owner.
 */
function TeamAccountability({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<CashierAccountability[] | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    apiRequest<CashierAccountability[]>(
      `/api/reports/cashiers?from=${from}&to=${to}`,
    )
      .then((data) => alive && setRows(data))
      .catch(() => alive && setRows([]))
    return () => {
      alive = false
    }
  }, [from, to])
  if (!rows)
    return (
      <div className="empty-state">
        <span>{t('reports.loadingData')}</span>
      </div>
    )
  if (!rows.length)
    return (
      <div className="empty-state">
        <span>{t('reports.noChartData')}</span>
      </div>
    )
  return (
    <div className="report-tab-table table-responsive accountability-table">
      <div className="table-row table-head accountability-head">
        <span>{t('employees.employee')}</span>
        <span>{t('reports.ordersCol')}</span>
        <span>{t('reports.netRevenue')}</span>
        <span>{t('reports.discountsCol')}</span>
        <span>{t('reports.voidsCol')}</span>
        <span>{t('reports.cashVariance')}</span>
        <span />
      </div>
      {rows.map((row) => (
        <div key={row.cashier_id} className="accountability-row-wrap">
          <div
            className={`table-row accountability-head ${
              row.repeatedShortfall ? 'flagged' : ''
            }`}
          >
            <strong>
              {row.name}
              {row.repeatedShortfall && (
                <span className="shortfall-flag">
                  <AlertTriangle size={12} />
                  {t('reports.shortfallPattern', {
                    count: row.shortfallCount,
                  })}
                </span>
              )}
            </strong>
            <span>{row.completedOrderCount}</span>
            <span>{cents(row.netRevenueCents)}</span>
            <span>
              {row.discountCount} · {cents(row.discountsCents)}
              {row.voidCount + row.refundCount > 0 && (
                <small className="block-note">
                  {t('reports.refundsCol')}: {row.refundCount} ·{' '}
                  {cents(row.refundAmountCents)}
                </small>
              )}
            </span>
            <span>
              {row.voidCount} · {cents(row.voidAmountCents)}
            </span>
            <span>
              {row.shiftsClosed === 0
                ? '—'
                : t('reports.shiftsClosedShort', {
                    count: row.shiftsClosed,
                    short: row.shortfallCount,
                  })}
            </span>
            <button
              className="text-button"
              onClick={() =>
                setExpanded(expanded === row.cashier_id ? null : row.cashier_id)
              }
            >
              {expanded === row.cashier_id
                ? t('reports.hideHistory')
                : t('reports.viewHistory')}
            </button>
          </div>
          {expanded === row.cashier_id && (
            <div className="variance-history">
              {row.varianceHistory.length === 0 && (
                <p>{t('reports.noShiftsInRange')}</p>
              )}
              {row.varianceHistory.map((shift, index) => (
                <div className="table-row variance-row" key={index}>
                  <span>
                    {shift.closedAt
                      ? new Date(shift.closedAt).toLocaleString()
                      : '—'}
                  </span>
                  <span>{cents(shift.openingCashUsdCents)}</span>
                  <span>{cents(shift.expectedCashUsdCents)}</span>
                  <span>{cents(shift.closingCashUsdCents)}</span>
                  <strong
                    className={
                      shift.varianceUsdCents < 0
                        ? 'coral-text'
                        : shift.varianceUsdCents > 0
                          ? 'amber-text'
                          : 'green-text'
                    }
                  >
                    {shift.varianceUsdCents < 0 ? '−' : ''}
                    {cents(Math.abs(shift.varianceUsdCents))}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

type AuditRow = {
  id: number
  at: string
  employee: string
  employeeId: number | null
  action: string
  orderId: string | null
  details: Record<string, unknown>
  ip: string | null
}

const auditActionGroups = [
  { id: '', key: 'reports.allActions' },
  { id: 'discount', key: 'reports.discountsCol' },
  { id: 'order.voided', key: 'reports.voidsCol' },
  { id: 'order.refunded', key: 'reports.refundsCol' },
  { id: 'order.price_override', key: 'reports.priceOverride' },
  { id: 'order.cancelled', key: 'reports.cancellations' },
  { id: 'order.completed', key: 'reports.conversions' },
  { id: 'shift', key: 'reports.shiftEvents' },
  { id: 'product', key: 'reports.productEvents' },
  { id: 'customer_order', key: 'reports.customerOrders' },
]

function describeDetails(details: Record<string, unknown>): string {
  const parts: string[] = []
  const money = (key: string, label: string) => {
    const value = details[key]
    if (typeof value === 'number') parts.push(`${label} ${cents(value)}`)
  }
  if (typeof details.from === 'string' && typeof details.to === 'string')
    parts.push(`${details.from} → ${details.to}`)
  money('beforeCents', 'before')
  money('afterCents', 'after')
  money('discountAmountCents', 'discount')
  money('amountCents', 'amount')
  money('varianceUsdCents', 'variance')
  money('expectedCashUsdCents', 'expected')
  money('closingCashUsdCents', 'counted')
  // Product deactivation / stock-zero reasons (accountability picklist).
  if (typeof details.productName === 'string') parts.push(String(details.productName))
  if (details.activeBefore !== undefined || details.stockBefore !== undefined) {
    const activeBefore = details.activeBefore ? 'active' : 'off'
    const activeAfter = details.activeAfter ? 'active' : 'off'
    parts.push(`${activeBefore}→${activeAfter}, ${details.stockBefore}→${details.stockAfter} units`)
  }
  if (typeof details.reasonCode === 'string') parts.push(`reason: ${details.reasonCode}`)
  if (typeof details.reasonNote === 'string' && details.reasonNote)
    parts.push(`“${details.reasonNote}”`)
  if (typeof details.pickupCode === 'string')
    parts.push(`code ${details.pickupCode}`)
  if (typeof details.phone === 'string') parts.push(String(details.phone))
  return parts.join(' · ') || '—'
}

function AuditLogPanel({
  from,
  to,
  onToast,
}: {
  from: string
  to: string
  onToast: (message: string) => void
}) {
  const { t } = useTranslation()
  const { employees } = useAdminData()
  const [rows, setRows] = useState<AuditRow[]>([])
  const [employee, setEmployee] = useState('')
  const [action, setAction] = useState('')
  const [newestFirst, setNewestFirst] = useState(true)
  useEffect(() => {
    let alive = true
    const params = new URLSearchParams({ from, to })
    if (employee) params.set('employee', employee)
    if (action) params.set('action', action)
    apiRequest<AuditRow[]>(`/api/reports/audit?${params.toString()}`)
      .then((data) => alive && setRows(data))
      .catch((error) => {
        if (alive) {
          setRows([])
          onToast(error instanceof Error ? error.message : 'Audit load failed')
        }
      })
    return () => {
      alive = false
    }
  }, [from, to, employee, action, onToast])
  const sorted = newestFirst ? rows : [...rows].reverse()
  const exportAudit = () =>
    downloadCsv(
      `audit-log-${from}-${to}.csv`,
      ['Timestamp', 'Employee', 'Action', 'Order', 'Details'],
      sorted.map((row) => [
        new Date(row.at).toLocaleString(),
        row.employee,
        row.action,
        row.orderId || '',
        describeDetails(row.details),
      ]),
    )
  return (
    <div className="audit-log-panel">
      <div className="audit-filters">
        <select value={employee} onChange={(e) => setEmployee(e.target.value)}>
          <option value="">{t('reports.allEmployees')}</option>
          {employees.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          {auditActionGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {t(group.key)}
            </option>
          ))}
        </select>
        <button
          className="text-button"
          onClick={() => setNewestFirst(!newestFirst)}
        >
          {newestFirst ? t('reports.newestFirst') : t('reports.oldestFirst')}
        </button>
        <button className="text-button" onClick={exportAudit}>
          <Download size={14} /> {t('common.export')}
        </button>
      </div>
      <div className="table-responsive">
        <div className="table-row table-head audit-head">
          <span>{t('dashboard.time')}</span>
          <span>{t('employees.employee')}</span>
          <span>{t('reports.actionCol')}</span>
          <span>{t('orders.order')}</span>
          <span>{t('reports.detailsCol')}</span>
        </div>
        {sorted.map((row) => (
          <div className="table-row audit-row" key={row.id}>
            <span>{new Date(row.at).toLocaleString()}</span>
            <strong>{row.employee}</strong>
            <span className="audit-action">{row.action}</span>
            <span>{row.orderId || '—'}</span>
            <small>{describeDetails(row.details)}</small>
          </div>
        ))}
        {!sorted.length && (
          <div className="empty-state">
            <ShieldAlert size={22} />
            <span>{t('reports.noAuditEvents')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Period-over-period comparison: fetches the report summary for the selected
 * range and for the equal-length range immediately before it, from the same
 * /api/reports/summary endpoint the dashboard uses.
 */
function PeriodComparison({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation()
  const [current, setCurrent] = useState<{
    netRevenueCents: number
    completedOrderCount: number
  } | null>(null)
  const [previous, setPrevious] = useState<{
    netRevenueCents: number
    completedOrderCount: number
  } | null>(null)
  useEffect(() => {
    let alive = true
    const start = new Date(`${from}T00:00:00`)
    const end = new Date(`${to}T23:59:59`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return
    const days = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 86400000) + 1,
    )
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const prevEnd = new Date(start.getTime() - 86400000)
    const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000)
    const pick = (data: {
      netRevenueCents?: number
      completedOrderCount?: number
    }) => ({
      netRevenueCents: data.netRevenueCents ?? 0,
      completedOrderCount: data.completedOrderCount ?? 0,
    })
    type SummaryLite = {
      netRevenueCents?: number
      completedOrderCount?: number
    }
    Promise.all([
      apiRequest<SummaryLite>(
        `/api/reports/summary?from=${iso(start)}&to=${iso(end)}`,
      ),
      apiRequest<SummaryLite>(
        `/api/reports/summary?from=${iso(prevStart)}&to=${iso(prevEnd)}`,
      ),
    ])
      .then(([cur, prev]) => {
        if (!alive) return
        setCurrent(pick(cur))
        setPrevious(pick(prev))
      })
      .catch(() => {
        if (alive) {
          setCurrent(null)
          setPrevious(null)
        }
      })
    return () => {
      alive = false
    }
  }, [from, to])
  if (!current || !previous) return null
  const delta = (cur: number, prev: number) =>
    prev === 0 ? null : ((cur - prev) / prev) * 100
  const salesDelta = delta(current.netRevenueCents, previous.netRevenueCents)
  const ordersDelta = delta(
    current.completedOrderCount,
    previous.completedOrderCount,
  )
  const renderDelta = (value: number | null) =>
    value === null ? (
      <span className="report-compare-neutral">
        {t('reports.noPreviousData')}
      </span>
    ) : (
      <span className={value >= 0 ? 'green-text' : 'coral-text'}>
        {value >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
        {Math.abs(value).toFixed(1)}%
      </span>
    )
  return (
    <div className="glass-panel report-comparison">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">{t('reports.comparison')}</span>
          <h2>{t('reports.vsPreviousPeriod')}</h2>
        </div>
      </div>
      <div className="report-comparison-grid">
        <div>
          <span>{t('dashboard.netSales')}</span>
          <strong>{cents(current.netRevenueCents)}</strong>
          {renderDelta(salesDelta)}
        </div>
        <div>
          <span>{t('dashboard.orders')}</span>
          <strong>{current.completedOrderCount}</strong>
          {renderDelta(ordersDelta)}
        </div>
        <div>
          <span>{t('reports.previousPeriod')}</span>
          <strong>{cents(previous.netRevenueCents)}</strong>
          <small>
            {previous.completedOrderCount} {t('reports.ordersShort')}
          </small>
        </div>
      </div>
    </div>
  )
}

function ReportKpi({
  label,
  value,
  change,
  up,
  detail,
}: {
  label: string
  value: string
  change?: string
  up?: boolean
  detail: string
}) {
  return (
    <article className="glass-panel report-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      {change ? (
        <div className={up ? 'green-text' : 'coral-text'}>
          {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          <b>{change}</b>
          <small>{detail}</small>
        </div>
      ) : (
        <div className="report-kpi-detail">
          <small>{detail}</small>
        </div>
      )}
    </article>
  )
}
function ComparisonChart({ waste }: { waste: boolean }) {
  const { t } = useTranslation()
  const { revenueData, freshness } = useAdminData()
  const series = waste ? (freshness?.dailyWaste ?? []) : revenueData
  const maxValue = Math.max(1, ...series.map((item) => item.value))
  const topLabel =
    maxValue >= 1000
      ? `$${(maxValue / 1000).toFixed(maxValue >= 10000 ? 0 : 1)}k`
      : `$${maxValue.toFixed(0)}`
  const midLabel =
    maxValue >= 1000
      ? `$${(maxValue / 2000).toFixed(maxValue >= 10000 ? 0 : 1)}k`
      : `$${(maxValue / 2).toFixed(0)}`
  return (
    <div className="comparison-chart">
      <div className="bar-y-labels">
        <span>{topLabel}</span>
        <span>{midLabel}</span>
        <span>$0</span>
      </div>
      <div className="bar-plot">
        {series.map((item) => (
          <div className="bar-group" key={item.day}>
            <div className="bar-tooltip">${item.value.toFixed(2)}</div>
            <div className="bars">
              <i
                className="sales-bar"
                style={{
                  height: `${Math.min(100, (item.value / maxValue) * 100)}%`,
                }}
              />
            </div>
            <span>{formatReportDay(item.day)}</span>
          </div>
        ))}
      </div>
      {series.length === 0 && (
        <div className="empty-state">
          <span>{t('reports.noChartData')}</span>
        </div>
      )}
    </div>
  )
}

function formatReportDay(day: string) {
  const [year, month, date] = day.split('-')
  if (!date) return day
  const parsed = new Date(`${year}-${month}-${date}T00:00:00`)
  return parsed.toLocaleDateString('en', {
    day: 'numeric',
    month: 'short',
  })
}
function dayName(day: string) {
  const [year, month, date] = day.split('-')
  if (!date) return day
  return new Date(`${year}-${month}-${date}T00:00:00`).toLocaleDateString(
    'en',
    { weekday: 'long' },
  )
}
