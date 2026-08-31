import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  FileText,
  Lightbulb,
  Send,
  ShieldAlert,
  Store,
  TrendingUp,
  X,
} from 'lucide-react'
import type { Order, Product, RevenuePoint, WasteEvent } from '../data'
import { useAdminData } from '../lib/data'
import { apiRequest } from '../lib/api'
import { translateCategory, useTranslation } from '../lib/i18n'
import ReportDetailTable from '../components/ReportDetailTable'
import ExportPreviewModal, {
  type ExportRequest,
} from '../components/ExportPreviewModal'
import { ordersInRange, type LossesReport } from '../lib/exports'
import {
  defaultBranding,
  type ReportBranding,
  type ReportLanguage,
} from '../lib/reportBranding'

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
  const [activePreset, setActivePreset] = useState<string | null>('this_month')
  const [libraryPicker, setLibraryPicker] = useState<{
    key: string
    label: string
  } | null>(null)
  // Letterhead identity + report language come from Settings, so every
  // export carries the shop's real name/address and the labels the owner
  // chose — not hardcoded strings baked into the exporter.
  const [branding, setBranding] = useState<ReportBranding>(defaultBranding)
  const [language, setLanguage] = useState<ReportLanguage>('en')
  const [posRules, setPosRules] = useState<Record<string, unknown> | null>(null)
  // Nothing downloads on click: the request is staged here and the review
  // dialog is what actually generates the file.
  const [exportRequest, setExportRequest] = useState<ExportRequest | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const profile = await apiRequest<{
          businessName?: string
          locationName?: string
          address?: string
          phone?: string
        }>('/api/settings/business-profile')
        if (!cancelled && profile) {
          setBranding({
            businessName: profile.businessName || defaultBranding.businessName,
            locationName: profile.locationName || '',
            address: profile.address || '',
            phone: profile.phone || '',
          })
        }
      } catch {
        // Offline or unauthorised: fall back to the default letterhead.
      }
      try {
        const rules = await apiRequest<Record<string, unknown>>(
          '/api/settings/pos-rules',
        )
        if (!cancelled && rules) {
          setPosRules(rules)
          if (rules.reportLanguage === 'km' || rules.reportLanguage === 'en') {
            setLanguage(rules.reportLanguage)
          }
        }
      } catch {
        // Keep the English default when the setting cannot be read.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  // Remember the language with the rest of the POS rules so the choice
  // survives a reload and applies to every terminal, not just this tab.
  const changeLanguage = (next: ReportLanguage) => {
    setLanguage(next)
    if (!posRules) return
    const payload = { ...posRules, reportLanguage: next }
    setPosRules(payload)
    void apiRequest('/api/settings/pos-rules', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }).catch(() => {
      /* A failed save must not block the download in front of the admin. */
    })
  }
  const stageExport = (request: ExportRequest) => setExportRequest(request)
  const wasteInRange = (freshness?.events ?? []).filter((event) =>
    inRange(event.recordedAt, from, to),
  )
  /** The whole selected period as one order table, staged for review. */
  const ordersExportRequest = (format: 'word' | 'excel'): ExportRequest => ({
    meta: {
      title: t('reports.ordersInPeriod'),
      from,
      to,
      branding,
      language,
      totals: [
        {
          label: t('orders.total'),
          value: usd(
            selectedOrders.reduce(
              (sum, order) => sum + safeNumber(order.total),
              0,
            ),
          ),
        },
      ],
    },
    header: orderExportHeader,
    rows: selectedOrders.map(orderExportRow),
    filenameBase: `orders-${from || 'all'}-${to || 'all'}`,
    defaultFormat: format,
  })
  const selectedOrders = ordersInRange(orders, from, to)
  const applyPreset = (preset: string) => {
    const range = rangeForPreset(preset)
    setFrom(range.from)
    setTo(range.to)
    setActivePreset(preset)
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
  // Each library item builds the report that matches its label from the
  // dataset the admin chose in the export dialog, then hands it to the
  // review step — a library click never downloads anything by itself.
  const buildLibraryExport = (
    key: string,
    label: string,
    rangeOrders: typeof orders,
    rangeFrom: string,
    rangeTo: string,
  ): ExportRequest => {
    const suffix = `${rangeFrom || 'all'}-${rangeTo || 'all'}`
    const meta = (
      title: string,
      totals?: Array<{ label: string; value: string }>,
    ) => ({
      title,
      from: rangeFrom,
      to: rangeTo,
      branding,
      language,
      totals,
    })
    switch (key) {
      case 'dailySummary': {
        const revenue = rangeOrders.reduce(
          (sum, order) => sum + safeNumber(order.total),
          0,
        )
        const items = rangeOrders.reduce(
          (sum, order) => sum + safeNumber(order.items),
          0,
        )
        const average = rangeOrders.length ? revenue / rangeOrders.length : 0
        return {
          meta: meta(t(label)),
          header: ['Metric', 'Value'],
          rows: [
            ['Orders', rangeOrders.length],
            ['Items sold', items],
            ['Revenue (USD)', Number(revenue.toFixed(2))],
            ['Average order (USD)', Number(average.toFixed(2))],
            ...summaryTopProductRows(rangeOrders, products),
          ],
          filenameBase: `daily-summary-${suffix}`,
        }
      }
      case 'sellThrough':
        return {
          meta: meta(t(label)),
          header: ['Product', 'Category', 'Sold', 'On hand', 'Sell-through %'],
          rows: rangeProductSellThrough(rangeOrders, products),
          filenameBase: `product-sell-through-${suffix}`,
        }
      case 'reconciliation':
        return {
          meta: meta(t(label)),
          header: ['Order', 'Date', 'Payment', 'Status', 'Total (USD)'],
          rows: rangeOrders.map((order) => [
            order.id,
            new Date(order.createdAt).toLocaleDateString('en-CA'),
            order.payment || 'Unpaid',
            order.status,
            Number(safeNumber(order.total).toFixed(2)),
          ]),
          filenameBase: `payment-reconciliation-${suffix}`,
        }
      case 'shiftVariance':
        return {
          meta: meta(t(label)),
          header: [
            'Opened',
            'Closed',
            'Opened by',
            'Opening cash (USD)',
            'Expected cash (USD)',
            'Counted cash (USD)',
            'Variance (USD)',
            'Status',
          ],
          rows: shifts
            .filter(
              (shift) =>
                inRange(shift.openedAt, rangeFrom, rangeTo) ||
                inRange(shift.closedAt, rangeFrom, rangeTo),
            )
            .map((shift) => [
              new Date(shift.openedAt).toLocaleString(),
              shift.closedAt ? new Date(shift.closedAt).toLocaleString() : '',
              shift.openedBy || '',
              Number(((shift.openingCashUsdCents ?? 0) / 100).toFixed(2)),
              Number(((shift.expectedCashUsdCents ?? 0) / 100).toFixed(2)),
              shift.closedAt
                ? Number(((shift.closingCashUsdCents ?? 0) / 100).toFixed(2))
                : '',
              shift.closedAt
                ? Number(((shift.varianceUsdCents ?? 0) / 100).toFixed(2))
                : '',
              shift.status,
            ]),
          filenameBase: `shift-variance-${suffix}`,
        }
      case 'freshWaste':
        return {
          meta: meta(t(label)),
          header: [
            'Date',
            'Product',
            'Quantity',
            'Reason',
            'Retail value (USD)',
            'Recorded by',
          ],
          rows: wasteInRange.map((event) => [
            new Date(event.recordedAt).toLocaleString(),
            event.productName,
            event.quantity,
            event.reason,
            Number(safeNumber(event.retailValue).toFixed(2)),
            event.recordedBy || '',
          ]),
          filenameBase: `freshness-waste-${suffix}`,
        }
      case 'employeePerformance':
        return {
          meta: meta(t(label)),
          header: ['Employee', 'Role', 'Orders', 'Sales (USD)'],
          rows: rangeEmployeePerformance(rangeOrders),
          filenameBase: `employee-performance-${suffix}`,
        }
      default:
        return {
          meta: meta(t(label)),
          header: orderExportHeader,
          rows: rangeOrders.map(orderExportRow),
          filenameBase: `orders-${suffix}`,
        }
    }
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
                className={`text-button ${activePreset === preset.id ? 'active' : ''}`}
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
              onChange={(event) => {
                setFrom(event.target.value)
                setActivePreset(null)
              }}
            />
          </label>
          <label>
            {t('reports.to')}
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value)
                setActivePreset(null)
              }}
            />
          </label>
          <button
            className="secondary-button"
            onClick={() => stageExport(ordersExportRequest('word'))}
          >
            <FileText size={16} /> Word
          </button>
          <button
            className="primary-button"
            onClick={() => stageExport(ordersExportRequest('excel'))}
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
            <AuditLogPanel
              from={from}
              to={to}
              onToast={onToast}
              branding={branding}
              language={language}
              onReview={stageExport}
            />
          )}
          {tab === 'losses' && (
            <LossesPanel
              from={from}
              to={to}
              branding={branding}
              language={language}
              onReview={stageExport}
            />
          )}
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
      {DETAIL_TABLE_TABS.includes(tab) && (
        <TabDetailSection
          tab={tab}
          orders={selectedOrders}
          products={products}
          waste={wasteInRange}
          from={from}
          to={to}
          onExport={({ header, rows, filters, title }) =>
            stageExport({
              meta: { title, from, to, branding, language, filters },
              header,
              rows,
              filenameBase: `${title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')}-${from || 'all'}-${to || 'all'}`,
            })
          }
        />
      )}
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
            <button key={item.key} onClick={() => setLibraryPicker(item)}>
              <FileSpreadsheet size={19} />
              <span>
                <strong>{t(item.label)}</strong>
                <small>
                  {t('reports.csvRange', {
                    range: formatReportRange(from, to),
                  })}
                </small>
              </span>
              <Download size={16} />
            </button>
          ))}
        </div>
      </section>
      {libraryPicker && (
        <LibraryExportModal
          item={libraryPicker}
          defaultFrom={from}
          defaultTo={to}
          onClose={() => setLibraryPicker(null)}
          onExport={(key, label, rangeFrom, rangeTo) => {
            const rangeOrders = ordersInRange(orders, rangeFrom, rangeTo)
            stageExport(
              buildLibraryExport(key, label, rangeOrders, rangeFrom, rangeTo),
            )
            setLibraryPicker(null)
          }}
        />
      )}
      {exportRequest && (
        <ExportPreviewModal
          request={exportRequest}
          language={language}
          onLanguage={changeLanguage}
          onClose={() => setExportRequest(null)}
          onDone={onToast}
        />
      )}
    </div>
  )
}

function LibraryExportModal({
  item,
  defaultFrom,
  defaultTo,
  onClose,
  onExport,
}: {
  item: { key: string; label: string }
  defaultFrom: string
  defaultTo: string
  onClose: () => void
  onExport: (key: string, label: string, from: string, to: string) => void
}) {
  const { t } = useTranslation()
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <button
        className="modal-backdrop"
        onClick={onClose}
        aria-label={t('modal.closeDialog')}
      />
      <section className="modal-card modal-small">
        <header className="modal-header">
          <div>
            <span>{t('reports.downloads')}</span>
            <h2>{t(item.label)}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t('modal.close')}
          >
            <X size={19} />
          </button>
        </header>
        <div className="modal-form">
          <p>{t('reports.filterFirst')}</p>
          <label>
            <span>{t('reports.from')}</span>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            <span>{t('reports.to')}</span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => onExport(item.key, item.label, from, to)}
            >
              <Download size={15} />
              {t('reports.exportFiltered')}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
/** The order-table shape shared by the toolbar export and the library. */
const orderExportHeader = [
  'Order ID',
  'Date',
  'Time',
  'Source',
  'Customer / Cashier',
  'Items',
  'Details',
  'Subtotal (USD)',
  'Discount (USD)',
  'Payment',
  'Status',
  'Total (USD)',
]

const orderExportRow = (order: Order): Array<string | number> => [
  order.id,
  new Date(order.createdAt).toLocaleDateString('en-CA'),
  order.time,
  order.source,
  order.customer?.name || order.cashier || '',
  safeNumber(order.items),
  (order.detail ?? []).join('; '),
  Number(safeNumber(order.subtotal ?? order.total).toFixed(2)),
  Number(safeNumber(order.discountAmount).toFixed(2)),
  order.payment || '',
  order.status,
  Number(safeNumber(order.total).toFixed(2)),
]

/** Top sellers appended under the daily-summary KPI rows. */
const summaryTopProductRows = (
  orders: Order[],
  products: Product[],
): Array<Array<string | number>> =>
  rangeProductSellThrough(orders, products)
    .slice(0, 5)
    .map((row) => [`Top seller · ${row[0]}`, row[2]])

const cents = (value: number) => `$${(value / 100).toFixed(2)}`
const safeNumber = (value: number | null | undefined) =>
  Number.isFinite(value as number) ? (value as number) : 0
const usd = (value: number | null | undefined) =>
  `$${safeNumber(value).toFixed(2)}`
const inRange = (iso: string | null | undefined, from: string, to: string) => {
  if (!iso) return false
  const day = new Date(iso).toISOString().slice(0, 10)
  return day >= from && day <= to
}
/**
 * Tabs that browse raw records. Sales/Team browse orders, Products browses
 * the individual sold line items, Payments browses each tendered payment
 * and Waste browses each recorded waste event. Losses (a five-row rollup)
 * and the Audit log (already an event list with its own filters) do not get
 * a second table.
 */
const DETAIL_TABLE_TABS = ['sales', 'products', 'payments', 'team', 'waste']

const orderWho = (order: Order) => order.customer?.name || order.cashier || ''
const orderItemsText = (order: Order) =>
  (order.detail ?? []).join('; ') ||
  (order.lineItems ?? [])
    .map((line) => `${line.description ?? '—'} × ${line.quantity}`)
    .join('; ')
const stamp = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString() : '—'
const stampSort = (iso: string | null | undefined) =>
  iso ? new Date(iso).getTime() || 0 : 0
const sourceLabel = (t: TranslationFn, order: Order) =>
  order.source === 'telegram' ? t('orders.telegram') : t('orders.walkIn')
const sourcePill = (t: TranslationFn, order: Order) => (
  <span className={`source-pill ${order.source}`}>
    {order.source === 'telegram' ? <Send size={12} /> : <Store size={12} />}
    <strong>{sourceLabel(t, order)}</strong>
  </span>
)
const statusPill = (status: string) => (
  <span className={`status-badge order-status-${status.toLowerCase()}`}>
    <i />
    {status}
  </span>
)

type TranslationFn = (
  key: string,
  variables?: Record<string, string | number>,
) => string

type ProductLineRow = {
  order: Order
  description: string
  category: string
  quantity: number
  unitPriceCents: number
  lineTotalCents: number
  index: number
}

type PaymentRow = {
  order: Order
  method: string
  status: string
  amountUsdCents: number
  tenderedUsdCents: number | null
  tenderedKhr: number | null
  changeUsdCents: number | null
  rate: number | null
  at: string
  index: number
}

/** Expand every order in range into its individual sold line items. */
function productLineRows(
  orders: Order[],
  products: Product[],
): ProductLineRow[] {
  const byId = new Map(products.map((product) => [product.id, product]))
  const rows: ProductLineRow[] = []
  orders.forEach((order) => {
    const lines = order.lineItems ?? []
    if (lines.length) {
      lines.forEach((line, index) => {
        rows.push({
          order,
          description:
            line.description ||
            (line.productId ? byId.get(line.productId)?.name : '') ||
            '—',
          category:
            (line.productId ? byId.get(line.productId)?.category : '') || '—',
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          lineTotalCents:
            line.lineTotalCents ?? line.unitPriceCents * line.quantity,
          index,
        })
      })
      return
    }
    // Legacy orders only kept the printed detail lines ("Cake × 2").
    ;(order.detail ?? []).forEach((entry, index) => {
      const [name, quantity] = entry.split(' × ')
      rows.push({
        order,
        description: name || '—',
        category: '—',
        quantity: Number(quantity) || 1,
        unitPriceCents: 0,
        lineTotalCents: 0,
        index,
      })
    })
  })
  return rows
}

/** Expand every order in range into its confirmed payment records. */
function paymentRows(orders: Order[]): PaymentRow[] {
  const rows: PaymentRow[] = []
  orders.forEach((order) => {
    const payments = order.payments ?? []
    if (payments.length) {
      payments.forEach((payment, index) => {
        rows.push({
          order,
          method: payment.method === 'qr_manual' ? 'KHQR' : payment.method,
          status: payment.status,
          amountUsdCents: payment.amountUsdCents,
          tenderedUsdCents: payment.tenderedUsdCents ?? null,
          tenderedKhr: payment.tenderedKhr ?? null,
          changeUsdCents: payment.changeUsdCents ?? null,
          rate: payment.exchangeRateKhrPerUsd ?? null,
          at: payment.confirmedAt ?? order.createdAt,
          index,
        })
      })
      return
    }
    // No payment row yet (held/pending/cancelled): still browsable, marked
    // as unpaid rather than silently dropped from the payments view.
    rows.push({
      order,
      method: order.payment ?? '—',
      status: order.paymentStatus ?? 'unpaid',
      amountUsdCents: Math.round(safeNumber(order.total) * 100),
      tenderedUsdCents: null,
      tenderedKhr: null,
      changeUsdCents: null,
      rate: null,
      at: order.createdAt,
      index: 0,
    })
  })
  return rows
}

/**
 * The record-level view for the selected tab: the actual rows behind the
 * rollups, filtered by the same date range/preset chosen at the top of the
 * page plus per-column filters (cashier, payment method, status, source,
 * reason…), sortable and paginated. Export hands the exact filtered rows to
 * the review dialog, so a download can only ever contain what was on screen.
 */
function TabDetailSection({
  tab,
  orders,
  products,
  waste,
  from,
  to,
  onExport,
}: {
  tab: string
  orders: Order[]
  products: Product[]
  waste: WasteEvent[]
  from: string
  to: string
  onExport: (payload: {
    header: string[]
    rows: Array<Array<string | number>>
    filters: Array<{ label: string; value: string }>
    title: string
  }) => void
}) {
  const { t } = useTranslation()
  const rangeLabel = t('reports.detailNote', {
    range: formatReportRange(from, to),
  })
  const shared = { from, to, onExport, subtitle: rangeLabel }

  if (tab === 'waste') {
    return (
      <ReportDetailTable<WasteEvent>
        {...shared}
        title={t('reports.wasteRecords')}
        rows={waste}
        rowKey={(row) => String(row.id)}
        defaultSort={{ key: 'date', direction: 'desc' }}
        searchPlaceholder={t('reports.searchWaste')}
        filters={[
          {
            key: 'product',
            label: t('dashboard.product'),
            get: (row) => row.productName,
          },
          {
            key: 'reason',
            label: t('reports.reasonCol'),
            get: (row) => row.reason,
          },
          {
            key: 'recordedBy',
            label: t('employees.employee'),
            get: (row) => row.recordedBy || '—',
          },
        ]}
        columns={[
          {
            key: 'date',
            label: t('reports.dateTimeCol'),
            value: (row) => stamp(row.recordedAt),
            sort: (row) => stampSort(row.recordedAt),
          },
          {
            key: 'product',
            label: t('dashboard.product'),
            value: (row) => row.productName,
          },
          {
            key: 'category',
            label: t('catalog.category'),
            value: (row) => row.category || '—',
          },
          {
            key: 'quantity',
            label: t('dashboard.units'),
            numeric: true,
            value: (row) => row.quantity,
          },
          {
            key: 'reason',
            label: t('reports.reasonCol'),
            value: (row) => row.reason,
          },
          {
            key: 'value',
            label: t('reports.retailValue'),
            numeric: true,
            value: (row) => Number(safeNumber(row.retailValue).toFixed(2)),
            render: (row) => <strong>{usd(row.retailValue)}</strong>,
          },
          {
            key: 'by',
            label: t('reports.recordedBy'),
            value: (row) => row.recordedBy || '—',
          },
        ]}
      />
    )
  }

  if (tab === 'products') {
    const rows = productLineRows(orders, products)
    return (
      <ReportDetailTable<ProductLineRow>
        {...shared}
        title={t('reports.productRecords')}
        rows={rows}
        rowKey={(row) => `${row.order.id}-${row.index}-${row.description}`}
        defaultSort={{ key: 'date', direction: 'desc' }}
        searchPlaceholder={t('reports.searchProducts')}
        filters={[
          {
            key: 'product',
            label: t('dashboard.product'),
            get: (row) => row.description,
          },
          {
            key: 'category',
            label: t('catalog.category'),
            get: (row) => row.category,
          },
          {
            key: 'source',
            label: t('orders.source'),
            get: (row) => sourceLabel(t, row.order),
          },
          {
            key: 'status',
            label: t('orders.status'),
            get: (row) => row.order.status,
          },
        ]}
        columns={[
          {
            key: 'date',
            label: t('reports.dateTimeCol'),
            value: (row) => stamp(row.order.createdAt),
            sort: (row) => stampSort(row.order.createdAt),
          },
          {
            key: 'order',
            label: t('orders.order'),
            value: (row) => row.order.id,
            render: (row) => <strong>{row.order.id}</strong>,
          },
          {
            key: 'product',
            label: t('dashboard.product'),
            value: (row) => row.description,
          },
          {
            key: 'category',
            label: t('catalog.category'),
            value: (row) => row.category,
          },
          {
            key: 'quantity',
            label: t('dashboard.units'),
            numeric: true,
            value: (row) => row.quantity,
          },
          {
            key: 'unit',
            label: t('reports.unitPrice'),
            numeric: true,
            value: (row) => Number((row.unitPriceCents / 100).toFixed(2)),
            render: (row) => cents(row.unitPriceCents),
          },
          {
            key: 'line',
            label: t('reports.lineTotal'),
            numeric: true,
            value: (row) => Number((row.lineTotalCents / 100).toFixed(2)),
            render: (row) => <strong>{cents(row.lineTotalCents)}</strong>,
          },
          {
            key: 'status',
            label: t('orders.status'),
            value: (row) => row.order.status,
            render: (row) => statusPill(row.order.status),
          },
        ]}
      />
    )
  }

  if (tab === 'payments') {
    const rows = paymentRows(orders)
    return (
      <ReportDetailTable<PaymentRow>
        {...shared}
        title={t('reports.paymentRecords')}
        rows={rows}
        rowKey={(row) => `${row.order.id}-${row.index}`}
        defaultSort={{ key: 'date', direction: 'desc' }}
        searchPlaceholder={t('reports.searchPayments')}
        filters={[
          {
            key: 'method',
            label: t('orders.payment'),
            get: (row) => row.method,
          },
          {
            key: 'status',
            label: t('orders.status'),
            get: (row) => row.status,
          },
          {
            key: 'cashier',
            label: t('employees.employee'),
            get: (row) => row.order.cashier || '—',
          },
        ]}
        columns={[
          {
            key: 'date',
            label: t('reports.dateTimeCol'),
            value: (row) => stamp(row.at),
            sort: (row) => stampSort(row.at),
          },
          {
            key: 'order',
            label: t('orders.order'),
            value: (row) => row.order.id,
            render: (row) => <strong>{row.order.id}</strong>,
          },
          {
            key: 'method',
            label: t('orders.payment'),
            value: (row) => row.method,
          },
          {
            key: 'status',
            label: t('orders.status'),
            value: (row) => row.status,
          },
          {
            key: 'amount',
            label: t('orders.total'),
            numeric: true,
            value: (row) => Number((row.amountUsdCents / 100).toFixed(2)),
            render: (row) => <strong>{cents(row.amountUsdCents)}</strong>,
          },
          {
            key: 'tenderUsd',
            label: t('reports.tenderedUsd'),
            numeric: true,
            value: (row) =>
              row.tenderedUsdCents === null
                ? ''
                : Number((row.tenderedUsdCents / 100).toFixed(2)),
          },
          {
            key: 'tenderKhr',
            label: t('reports.tenderedKhr'),
            numeric: true,
            value: (row) => row.tenderedKhr ?? '',
          },
          {
            key: 'change',
            label: t('reports.changeGiven'),
            numeric: true,
            value: (row) =>
              row.changeUsdCents === null
                ? ''
                : Number((row.changeUsdCents / 100).toFixed(2)),
          },
          {
            key: 'cashier',
            label: t('employees.employee'),
            value: (row) => row.order.cashier || '—',
          },
        ]}
      />
    )
  }

  // Sales and Team both browse the orders themselves; Team simply opens on
  // the cashier column so accountability questions start grouped by person.
  const team = tab === 'team'
  return (
    <ReportDetailTable<Order>
      {...shared}
      title={team ? t('reports.teamRecords') : t('reports.detailTitle')}
      rows={orders}
      rowKey={(row) => row.id}
      defaultSort={
        team
          ? { key: 'cashier', direction: 'asc' }
          : { key: 'date', direction: 'desc' }
      }
      searchPlaceholder={t('reports.searchOrders')}
      filters={[
        {
          key: 'cashier',
          label: t('employees.employee'),
          get: (row) => row.cashier || '—',
        },
        {
          key: 'source',
          label: t('orders.source'),
          get: (row) => sourceLabel(t, row),
        },
        {
          key: 'payment',
          label: t('orders.payment'),
          get: (row) => row.payment || t('orders.notPaid'),
        },
        {
          key: 'status',
          label: t('orders.status'),
          get: (row) => row.status,
        },
      ]}
      columns={[
        {
          key: 'date',
          label: t('reports.dateTimeCol'),
          value: (row) => stamp(row.createdAt),
          sort: (row) => stampSort(row.createdAt),
        },
        {
          key: 'id',
          label: t('orders.order'),
          value: (row) => row.id,
          render: (row) => (
            <>
              <strong>{row.id}</strong>
              {row.pickupCode && (
                <small className="block-note">{row.pickupCode}</small>
              )}
            </>
          ),
        },
        {
          key: 'source',
          label: t('orders.source'),
          value: (row) => sourceLabel(t, row),
          render: (row) => sourcePill(t, row),
        },
        {
          key: 'cashier',
          label: t('employees.employee'),
          value: (row) => row.cashier || '—',
        },
        {
          key: 'who',
          label: t('orders.customerCashier'),
          value: (row) => orderWho(row) || '—',
        },
        {
          key: 'items',
          label: t('orders.items'),
          numeric: true,
          value: (row) => safeNumber(row.items),
          render: (row) => (
            <>
              <strong>{safeNumber(row.items)}</strong>
              <small className="block-note detail-items">
                {orderItemsText(row) || '—'}
              </small>
            </>
          ),
        },
        {
          key: 'payment',
          label: t('orders.payment'),
          value: (row) => row.payment || t('orders.notPaid'),
        },
        {
          key: 'total',
          label: t('orders.total'),
          numeric: true,
          value: (row) => Number(safeNumber(row.total).toFixed(2)),
          render: (row) => <strong>{usd(row.total)}</strong>,
        },
        {
          key: 'status',
          label: t('orders.status'),
          value: (row) => row.status,
          render: (row) => statusPill(row.status),
        },
      ]}
    />
  )
}

function rangeProductSellThrough(rangeOrders: Order[], products: Product[]) {
  const sold = new Map<
    string,
    { name: string; category: string; units: number }
  >()
  const productById = new Map(products.map((product) => [product.id, product]))
  for (const order of rangeOrders) {
    for (const line of order.lineItems ?? []) {
      if (!line.productId) continue
      const key = String(line.productId)
      const existing = sold.get(key)
      sold.set(key, {
        name:
          line.description ||
          productById.get(line.productId)?.name ||
          `#${line.productId}`,
        category: productById.get(line.productId)?.category || '',
        units: (existing?.units ?? 0) + line.quantity,
      })
    }
  }
  return products.map((product) => {
    const soldUnits = sold.get(String(product.id))?.units ?? 0
    const total = soldUnits + product.stock
    return [
      product.name,
      product.category,
      soldUnits,
      product.stock,
      total ? Math.round((soldUnits / total) * 100) : 0,
    ]
  })
}
function rangeEmployeePerformance(rangeOrders: Order[]) {
  const byCashier = new Map<string, { orders: number; totalUsd: number }>()
  for (const order of rangeOrders) {
    if (order.status !== 'Completed') continue
    const name = order.cashier || 'Unknown'
    const existing = byCashier.get(name)
    byCashier.set(name, {
      orders: (existing?.orders ?? 0) + 1,
      totalUsd: (existing?.totalUsd ?? 0) + safeNumber(order.total),
    })
  }
  return [...byCashier.entries()].map(([name, value]) => [
    name,
    '',
    value.orders,
    value.totalUsd.toFixed(2),
  ])
}

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

function LossesPanel({
  from,
  to,
  branding,
  language,
  onReview,
}: {
  from: string
  to: string
  branding: ReportBranding
  language: ReportLanguage
  onReview: (request: ExportRequest) => void
}) {
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
    <div className="report-tab-table report-tab-table--2col table-responsive">
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
      <div className="table-row table-total">
        <strong>{t('reports.totalLost')}</strong>
        <strong className="numeric">{cents(data.totalLostCents)}</strong>
      </div>
      <div className="report-export-actions">
        <button
          className="text-button"
          onClick={() =>
            onReview({
              meta: {
                title: t('reports.lossesTitle'),
                from,
                to,
                branding,
                language,
                totals: [
                  {
                    label: t('reports.totalLost'),
                    value: cents(data.totalLostCents),
                  },
                ],
              },
              header: [t('reports.losses'), 'USD'],
              rows: rows.map((row) => [
                row.label,
                Number((row.value / 100).toFixed(2)),
              ]),
              filenameBase: `losses-${from || 'all'}-${to || 'all'}`,
            })
          }
        >
          <Download size={14} /> {t('reports.reviewAndExport')}
        </button>
      </div>
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
    <div className="report-tab-table report-tab-table--4col table-responsive">
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
          <strong className="numeric">{usd(product.revenue)}</strong>
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
    <div className="report-tab-table report-tab-table--3col table-responsive">
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
          <strong className="numeric">{usd(row.value)}</strong>
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
  if (typeof details.productName === 'string')
    parts.push(String(details.productName))
  if (details.activeBefore !== undefined || details.stockBefore !== undefined) {
    const activeBefore = details.activeBefore ? 'active' : 'off'
    const activeAfter = details.activeAfter ? 'active' : 'off'
    parts.push(
      `${activeBefore}→${activeAfter}, ${details.stockBefore}→${details.stockAfter} units`,
    )
  }
  if (typeof details.reasonCode === 'string')
    parts.push(`reason: ${details.reasonCode}`)
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
  branding,
  language,
  onReview,
}: {
  from: string
  to: string
  onToast: (message: string) => void
  branding: ReportBranding
  language: ReportLanguage
  onReview: (request: ExportRequest) => void
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
  // The audit log is evidence: it goes through the same review step, so the
  // exported file provably matches the filtered list on screen.
  const exportAudit = () =>
    onReview({
      meta: {
        title: t('reports.auditLog'),
        from,
        to,
        branding,
        language,
        filters: [
          ...(employee
            ? [
                {
                  label: t('employees.employee'),
                  value:
                    employees.find((member) => String(member.id) === employee)
                      ?.name || employee,
                },
              ]
            : []),
          ...(action ? [{ label: t('reports.actionCol'), value: action }] : []),
        ],
      },
      header: ['Timestamp', 'Employee', 'Action', 'Order', 'Details'],
      rows: sorted.map((row) => [
        new Date(row.at).toLocaleString(),
        row.employee,
        row.action,
        row.orderId || '',
        describeDetails(row.details),
      ]),
      filenameBase: `audit-log-${from || 'all'}-${to || 'all'}`,
    })
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
            <div className="bar-tooltip">{usd(item.value)}</div>
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

function formatReportRange(from: string, to: string) {
  if (!from && !to) return 'All time'
  const fmt = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString('en', {
      month: 'short',
      day: 'numeric',
    })
  const start = from ? fmt(from) : ''
  const end = to ? fmt(to) : 'today'
  if (from && to && from === to) return start
  if (from && to) return `${start} – ${end}`
  if (from) return `${start} – today`
  return `until ${end}`
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
