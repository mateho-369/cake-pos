import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Lightbulb,
  RefreshCw,
  Send,
  ShieldAlert,
  Store,
  TrendingUp,
} from 'lucide-react'
import type { Order, Product, RevenuePoint, Shift, WasteEvent } from '../data'
import { useAdminData } from '../lib/data'
import { apiRequest } from '../lib/api'
import { statusLabel, translateCategory, useTranslation } from '../lib/i18n'
import ReportDetailTable from '../components/ReportDetailTable'
import {
  BreakdownTable,
  buildBreakdown,
  DEFAULT_VIEWS,
  VIEWS_BY_TAB,
  ViewByDropdown,
  type BreakdownData,
  type BreakdownDrill,
  type BreakdownRow,
  type CashierBreakdownRow,
} from '../components/ReportBreakdown'
import {
  exportTableExcel,
  exportTableWord,
  ordersInRange,
  type LossesReport,
} from '../lib/exports'
import { REPORT_TABS } from '../lib/reportNav'
import {
  defaultBranding,
  type ReportBranding,
  type ReportLanguage,
} from '../lib/reportBranding'

export default function ReportsPage({
  onToast,
  initialTab,
  intentNonce = 0,
  onIntentConsumed,
  onOpenProduct,
  onOpenOrder,
  onOpenEmployee,
  onOpenCustomer,
  onOpenShift,
  onOpenCategory,
}: {
  onToast: (message: string) => void
  /** Tab id arriving from the sidebar dropdown (REPORT_TABS). */
  initialTab?: string
  /** Bumps so re-picking the same item re-triggers the intent effect. */
  intentNonce?: number
  onIntentConsumed?: () => void
  /** QuickZoom drill-throughs: report rows open their real record. */
  onOpenProduct?: (productId: number) => void
  onOpenOrder?: (orderId: string) => void
  onOpenEmployee?: (employeeId: number) => void
  onOpenCustomer?: (customerId: number) => void
  onOpenShift?: () => void
  onOpenCategory?: () => void
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
    customers,
    refresh,
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
  // Letterhead identity + report language come from Settings, so every
  // export carries the shop's real name/address and the labels the owner
  // chose — not hardcoded strings baked into the exporter.
  const [branding, setBranding] = useState<ReportBranding>(defaultBranding)
  const [language, setLanguage] = useState<ReportLanguage>('en')
  const [posRules, setPosRules] = useState<Record<string, unknown> | null>(null)
  // The View-by selection and the current QuickZoom drill (a summary row
  // whose transactions are being shown) are per-tab questions: switching
  // tabs starts each report fresh.
  const [viewBy, setViewBy] = useState<string>(DEFAULT_VIEWS.sales)
  const [drill, setDrill] = useState<BreakdownDrill | null>(null)
  useEffect(() => {
    setViewBy(DEFAULT_VIEWS[tab] ?? 'day')
    setDrill(null)
  }, [tab])
  // Breakdown endpoints, re-fetched whenever the range or the refresh
  // control changes. One fetch per range so the tables never lag the
  // preset pills above them.
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null)
  const [dataNonce, setDataNonce] = useState(0)
  useEffect(() => {
    let alive = true
    const range = `from=${from}&to=${to}`
    const get = <T,>(path: string): Promise<T | null> =>
      apiRequest<T>(path).catch(() => null)
    void (async () => {
      const [
        trend,
        peakHours,
        categories,
        customers,
        products,
        payments,
        cashiers,
      ] = await Promise.all([
        get<Array<{ period: string; netRevenueCents: number }>>(
          `/api/reports/revenue-trend?${range}`,
        ),
        get<Array<{ hour: number; orders: number; revenueCents: number }>>(
          `/api/reports/peak-hours?${range}`,
        ),
        get<
          Array<{
            category: string
            units: number
            netRevenueCents: number
            orders?: number
          }>
        >(`/api/reports/categories?${range}`),
        get<
          Array<{
            customer_id: number
            orders: number
            netRevenueCents: number
            lastOrderAt: string
          }>
        >(`/api/reports/customers?${range}`),
        get<
          Array<{
            product_id: number | null
            snapshotName: string
            quantity: number
            netRevenueCents: number
          }>
        >(`/api/reports/products?${range}`),
        get<
          Array<{
            method: string
            transactions: number
            amount_usd_cents: number
          }>
        >(`/api/reports/payments?${range}`),
        get<CashierBreakdownRow[]>(`/api/reports/cashiers?${range}`),
      ])
      if (!alive) return
      setBreakdown({
        trend: trend ?? [],
        peakHours: peakHours ?? [],
        categories: categories ?? [],
        customers: customers ?? [],
        products: products ?? [],
        payments: payments ?? [],
        cashiers,
      })
    })()
    return () => {
      alive = false
    }
  }, [from, to, dataNonce])
  // Manual retry: re-runs the current view+filter exactly as-is — the
  // admin's selection is never touched, only the data behind it.
  const refreshAll = () => {
    void refresh()
    setDataNonce((nonce) => nonce + 1)
  }
  // A sidebar dropdown pick lands here as an intent: switch to the tab,
  // then hand the intent back up.
  useEffect(() => {
    if (!initialTab) return
    if (REPORT_TABS.some((item) => item.id === initialTab)) {
      setTab(initialTab)
    }
    onIntentConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, intentNonce])
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
        // The receipt template carries the shop's own logo (Settings →
        // Receipts); when one is set, reports use it instead of the brand
        // mark, so the Word/Excel letterhead is editable end-to-end.
        const receipt = await apiRequest<{ logoUrl?: string }>(
          '/api/settings/receipt-template',
        )
        if (!cancelled && receipt?.logoUrl) {
          setBranding((current) => ({ ...current, logoUrl: receipt.logoUrl }))
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
  /**
   * The one download path for every Reports table. The review happens live
   * on screen (presets, View-by and per-column filters all update the table
   * immediately); picking Word or Excel exports exactly the rows currently
   * shown, stamped with the active filters so the file is self-describing.
   */
  const runExport = (payload: {
    header: string[]
    rows: Array<Array<string | number>>
    filters: Array<{ label: string; value: string }>
    title: string
    totals?: Array<{ label: string; value: string }>
    format: 'word' | 'excel'
  }) => {
    const meta = {
      title: payload.title,
      from,
      to,
      branding,
      language,
      filters: payload.filters,
      totals: payload.totals,
    }
    const base =
      payload.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'report'
    const save = (error: unknown) =>
      onToast(error instanceof Error ? error.message : 'Export failed')
    if (payload.format === 'excel') {
      void exportTableExcel(
        meta,
        payload.header,
        payload.rows,
        `${base}.xlsx`,
      ).catch(save)
    } else {
      void exportTableWord(
        meta,
        payload.header,
        payload.rows,
        `${base}.docx`,
      ).catch(save)
    }
  }
  const wasteInRange = (freshness?.events ?? []).filter((event) =>
    inRange(event.recordedAt, from, to),
  )
  // Losses (5-row money rollup) and the audit log live at page level now:
  // both the summary card AND the paginated detail table read one fetch.
  const [lossesData, setLossesData] = useState<LossesReport | null>(null)
  const [auditRows, setAuditRows] = useState<AuditRow[] | null>(null)
  useEffect(() => {
    let alive = true
    apiRequest<LossesReport>(`/api/reports/losses?from=${from}&to=${to}`)
      .then((row) => alive && setLossesData(row))
      .catch(() => alive && setLossesData(null))
    apiRequest<AuditRow[]>(`/api/reports/audit?from=${from}&to=${to}`)
      .then((rows) => alive && setAuditRows(rows))
      .catch((error) => {
        if (!alive) return
        setAuditRows([])
        onToast(error instanceof Error ? error.message : 'Audit load failed')
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])
  const selectedOrders = ordersInRange(orders, from, to)
  const applyPreset = (preset: string) => {
    const range = rangeForPreset(preset)
    setFrom(range.from)
    setTo(range.to)
    setActivePreset(preset)
  }
  const presets = [
    { id: 'today', label: 'reports.today' },
    { id: 'yesterday', label: 'reports.yesterday' },
    { id: 'this_week', label: 'reports.thisWeek' },
    { id: 'this_month', label: 'reports.thisMonth' },
    { id: 'last_month', label: 'reports.lastMonth' },
    { id: 'this_year', label: 'reports.thisYear' },
  ]
  // The five summary tabs render a View-by breakdown; the other three are
  // record tables already. Drilling a summary row swaps in the record table
  // behind that number (QuickZoom), with a back chip to return.
  const drillOrders = useMemo(() => {
    if (!drill) return selectedOrders
    const kind = drill.kind
    if (kind === 'date')
      return selectedOrders.filter(
        (order) => localDayOf(order.createdAt) === drill.value,
      )
    if (kind === 'hour')
      return selectedOrders.filter(
        (order) => String(new Date(order.createdAt).getHours()) === drill.value,
      )
    if (kind === 'method')
      return selectedOrders.filter((order) => order.payment === drill.value)
    return selectedOrders
  }, [drill, selectedOrders])
  const drillWaste = useMemo(() => {
    if (!drill) return wasteInRange
    if (drill.kind === 'date')
      return wasteInRange.filter(
        (event) => localDayOf(event.recordedAt) === drill.value,
      )
    if (drill.kind === 'reason')
      return wasteInRange.filter((event) => event.reason === drill.value)
    return wasteInRange
  }, [drill, wasteInRange])
  const handleBreakdownClick = (row: BreakdownRow) => {
    if (!row.drill) return
    const { kind, value, label } = row.drill
    if (kind === 'category') {
      onOpenCategory?.()
      return
    }
    if (kind === 'customer') {
      onOpenCustomer?.(Number(value))
      return
    }
    if (kind === 'product') {
      onOpenProduct?.(Number(value))
      return
    }
    setDrill({ kind, value, label })
  }
  return (
    <div className="page-content">
      <section className="reports-header">
        <div
          className="report-presets"
          role="group"
          aria-label={t('reports.dateRange')}
        >
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
          <button
            type="button"
            className={`text-button ${activePreset === 'none' ? 'active' : ''}`}
            onClick={() => applyPreset('none')}
          >
            {t('reports.noPreset')}
          </button>
        </div>
        <div className="toolbar-actions report-export-actions">
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
            type="button"
            className="icon-button report-refresh"
            aria-label={t('reports.refresh')}
            title={t('reports.refresh')}
            onClick={refreshAll}
          >
            <RefreshCw size={16} />
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
          {tab === 'products' && (
            <TopProductsTable onOpenProduct={onOpenProduct} />
          )}
          {tab === 'payments' && <PaymentsBreakdown />}
          {tab === 'team' && <TeamAccountability from={from} to={to} />}
          {tab === 'audit' && <AuditSummaryCard rows={auditRows ?? []} />}
          {tab === 'losses' && <LossesSummaryCard data={lossesData} />}
          {tab === 'shifts' && (
            <ShiftsSummaryCard
              shifts={shifts.filter(
                (shift) => shift.closedAt && inRange(shift.closedAt, from, to),
              )}
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
      {VIEWBY_TABS.includes(tab) && (
        <section className="report-viewby-section">
          <div className="report-viewby-bar">
            <ViewByDropdown
              value={viewBy}
              options={VIEWS_BY_TAB[tab]}
              onChange={(next) => {
                setViewBy(next)
                setDrill(null)
              }}
            />
            {drill && (
              <button
                type="button"
                className="drill-back"
                onClick={() => setDrill(null)}
              >
                <ArrowLeft size={14} />
                <span>{drill.label}</span>
                <small>{t('reports.backToSummary')}</small>
              </button>
            )}
          </div>
          {drill ? (
            drill.kind === 'cashier' ? (
              <TeamAccountability
                from={from}
                to={to}
                rows={breakdown?.cashiers ?? []}
                onlyEmployee={drill.value}
              />
            ) : (
              <TabDetailSection
                tab={tab}
                orders={drillOrders}
                products={products}
                waste={drillWaste}
                from={from}
                to={to}
                drillLabel={drill.label}
                onOpenProduct={onOpenProduct}
                onOpenOrder={onOpenOrder}
                onOpenEmployee={onOpenEmployee}
                onOpenCustomer={onOpenCustomer}
                onOpenShift={onOpenShift}
                lossesData={lossesData}
                auditRows={auditRows}
                employees={employees}
                customers={customers}
                shifts={shifts}
                onExport={runExport}
              />
            )
          ) : (
            <BreakdownView
              tab={tab}
              view={viewBy}
              breakdown={breakdown}
              orders={selectedOrders}
              waste={wasteInRange}
              customers={customers}
              products={products}
              from={from}
              to={to}
              onExport={runExport}
              onRowClick={handleBreakdownClick}
            />
          )}
        </section>
      )}
      {RECORD_TABS.includes(tab) && (
        <TabDetailSection
          tab={tab}
          orders={selectedOrders}
          products={products}
          waste={wasteInRange}
          from={from}
          to={to}
          onOpenProduct={onOpenProduct}
          onOpenOrder={onOpenOrder}
          onOpenEmployee={onOpenEmployee}
          onOpenCustomer={onOpenCustomer}
          onOpenShift={onOpenShift}
          lossesData={lossesData}
          auditRows={auditRows}
          employees={employees}
          customers={customers}
          shifts={shifts}
          onExport={runExport}
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
                  <ProductNameLink
                    id={product.id}
                    name={product.name}
                    onOpenProduct={onOpenProduct}
                  />
                </div>
                <strong>${product.revenue}</strong>
                <span className="margin-pill">{Math.round(share)}%</span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

/** What every table's Export menu hands the download runner. */
type ExportPayload = {
  header: string[]
  rows: Array<Array<string | number>>
  filters: Array<{ label: string; value: string }>
  title: string
  totals?: Array<{ label: string; value: string }>
  format: 'word' | 'excel'
}

const EMPTY_BREAKDOWN: BreakdownData = {
  trend: [],
  peakHours: [],
  categories: [],
  customers: [],
  products: [],
  payments: [],
  cashiers: null,
}

/**
 * The tab's View-by table: the breakdown built from the per-range report
 * endpoints, paginated, with the Export row below it. While the endpoints
 * are still loading (or the manual refresh re-runs them) the table shows
 * the loading empty state — never stale numbers.
 */
function BreakdownView({
  tab,
  view,
  breakdown,
  orders,
  waste,
  customers,
  products,
  from,
  to,
  onExport,
  onRowClick,
}: {
  tab: string
  view: string
  breakdown: BreakdownData | null
  orders: Order[]
  waste: WasteEvent[]
  customers: Array<{ id: number; name: string }>
  products: Product[]
  from: string
  to: string
  onExport: (payload: ExportPayload) => void
  onRowClick: (row: BreakdownRow) => void
}) {
  const { t } = useTranslation()
  const built = buildBreakdown({
    tab,
    view,
    data: breakdown ?? EMPTY_BREAKDOWN,
    orders,
    waste,
    customers,
    products,
    t,
  })
  const viewLabel = VIEWS_BY_TAB[tab]?.find(
    (option) => option.id === view,
  )?.labelKey
  return (
    <BreakdownTable
      title={tabTitle(t, tab)}
      subtitle={
        viewLabel ? `${t('reports.viewBy')}: ${t(viewLabel)}` : undefined
      }
      rows={breakdown ? built.rows : []}
      columns={built.columns}
      defaultSort={built.defaultSort}
      from={from}
      to={to}
      emptyText={
        breakdown ? t('reports.noTransactions') : t('reports.loadingData')
      }
      onExport={onExport}
      onRowClick={onRowClick}
    />
  )
}

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
  // Empty bounds mean "no date filter" (the None preset): everything passes.
  return (from === '' || day >= from) && (to === '' || day <= to)
}
/**
 * Tabs that browse raw records. Sales/Team browse orders, Products browses
 * the individual sold line items, Payments browses each tendered payment
 * and Waste browses each recorded waste event. Losses (a five-row rollup)
 * and the Audit log (already an event list with its own filters) do not get
 * a second table.
 */
/** Tabs whose default view is a View-by breakdown table. */
const VIEWBY_TABS = ['sales', 'products', 'payments', 'team', 'waste']
/** Tabs that are record tables already (no View-by dropdown). */
const RECORD_TABS = ['losses', 'shifts', 'audit']

const localDayOf = (iso: string): string => {
  const date = new Date(iso)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

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
const statusPill = (t: TranslationFn, status: string) => (
  <span className={`status-badge order-status-${status.toLowerCase()}`}>
    <i />
    {statusLabel(t, status)}
  </span>
)

/**
 * A product name inside Reports that jumps to that product's detail in the
 * catalog. Names without a resolvable id render as plain text, so a legacy
 * line can never look clickable without somewhere to go.
 */
function ProductNameLink({
  id,
  name,
  onOpenProduct,
}: {
  id: number | null | undefined
  name: string
  onOpenProduct?: (productId: number) => void
}) {
  if (id == null || !onOpenProduct) return <strong>{name}</strong>
  return (
    <button
      type="button"
      className="record-link"
      onClick={() => onOpenProduct(id)}
      title={name}
    >
      {name}
    </button>
  )
}

/** QuickZoom link: an order id in a report opens that order in Orders. */
function OrderLink({
  id,
  onOpenOrder,
}: {
  id: string
  onOpenOrder?: (orderId: string) => void
}) {
  if (!onOpenOrder) return <strong>{id}</strong>
  return (
    <button
      type="button"
      className="record-link"
      onClick={() => onOpenOrder(id)}
      title={id}
    >
      {id}
    </button>
  )
}

/** QuickZoom link: an employee name in a report opens their editor. */
function EmployeeLink({
  name,
  employees,
  onOpenEmployee,
}: {
  name: string
  employees: Array<{ id: number; name: string }>
  onOpenEmployee?: (employeeId: number) => void
}) {
  const employee = employees.find((item) => item.name === name)
  if (!employee || !onOpenEmployee) return <strong>{name}</strong>
  return (
    <button
      type="button"
      className="record-link"
      onClick={() => onOpenEmployee(employee.id)}
      title={name}
    >
      {name}
    </button>
  )
}

/** QuickZoom link: a customer name in a report opens their detail panel. */
function CustomerLink({
  name,
  customers,
  onOpenCustomer,
}: {
  name: string
  customers: Array<{ id: number; name: string }>
  onOpenCustomer?: (customerId: number) => void
}) {
  const customer = customers.find((item) => item.name === name)
  if (!customer || !onOpenCustomer) return <strong>{name}</strong>
  return (
    <button
      type="button"
      className="record-link"
      onClick={() => onOpenCustomer(customer.id)}
      title={name}
    >
      {name}
    </button>
  )
}

/** QuickZoom link: a closed shift row opens the Shifts page. */
function ShiftLink({
  label,
  onOpenShift,
}: {
  label: string
  onOpenShift?: () => void
}) {
  if (!onOpenShift) return <strong>{label}</strong>
  return (
    <button
      type="button"
      className="record-link"
      onClick={onOpenShift}
      title={label}
    >
      {label}
    </button>
  )
}

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
  productId: number | null
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
          productId: line.productId ?? null,
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
        productId: null,
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
  onOpenProduct,
  onOpenOrder,
  onOpenEmployee,
  onOpenCustomer,
  onOpenShift,
  lossesData,
  auditRows,
  employees,
  customers,
  shifts,
  drillLabel,
}: {
  tab: string
  orders: Order[]
  products: Product[]
  waste: WasteEvent[]
  from: string
  to: string
  onOpenProduct?: (productId: number) => void
  onOpenOrder?: (orderId: string) => void
  onOpenEmployee?: (employeeId: number) => void
  onOpenCustomer?: (customerId: number) => void
  onOpenShift?: () => void
  lossesData: LossesReport | null
  auditRows: AuditRow[] | null
  employees: Array<{ id: number; name: string }>
  customers: Array<{ id: number; name: string }>
  shifts: Shift[]
  /** QuickZoom context line shown under the title when drilled. */
  drillLabel?: string
  onExport: (payload: ExportPayload) => void
}) {
  const { t } = useTranslation()
  const rangeLabel = t('reports.detailNote', {
    range: formatReportRange(from, to),
  })
  const shared = { from, to, onExport, subtitle: drillLabel ?? rangeLabel }

  if (tab === 'losses') {
    const data = lossesData
    if (!data)
      return (
        <section className="glass-panel report-detail-panel">
          <div className="empty-state">
            <span>{t('reports.loadingData')}</span>
          </div>
        </section>
      )
    const rows = [
      { label: t('reports.waste'), valueCents: data.wasteCents },
      { label: t('reports.discounts'), valueCents: data.discountsCents },
      { label: t('reports.voids'), valueCents: data.voidsCents },
      { label: t('reports.refunds'), valueCents: data.refundsCents },
      {
        label: t('reports.cashShortages'),
        valueCents: data.cashShortagesCents,
      },
    ]
    return (
      <ReportDetailTable<{ label: string; valueCents: number }>
        {...shared}
        title={t('reports.lossesTitle')}
        rows={rows}
        rowKey={(row) => row.label}
        defaultSort={{ key: 'label', direction: 'asc' }}
        columns={[
          {
            key: 'label',
            label: t('reports.losses'),
            value: (row) => row.label,
          },
          {
            key: 'value',
            label: t('dashboard.revenue'),
            numeric: true,
            value: (row) => Number((row.valueCents / 100).toFixed(2)),
            render: (row) => <strong>{cents(row.valueCents)}</strong>,
          },
        ]}
        onExport={({ header, rows: exportRows, filters, title, format }) =>
          onExport({
            header,
            rows: exportRows,
            filters,
            title,
            format,
            totals: [
              {
                label: t('reports.totalLost'),
                value: cents(data.totalLostCents),
              },
            ],
          })
        }
      />
    )
  }

  if (tab === 'shifts') {
    const rows = shifts
      .filter((shift) => shift.closedAt && inRange(shift.closedAt, from, to))
      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))
    return (
      <ReportDetailTable<Shift>
        {...shared}
        title={t('reports.shiftRecords')}
        emptyText={t('reports.noShiftsInRange')}
        rows={rows}
        rowKey={(row) => String(row.id)}
        defaultSort={{ key: 'closed', direction: 'desc' }}
        filters={[
          {
            key: 'openedBy',
            label: t('employees.employee'),
            get: (row) => row.openedBy || '—',
          },
        ]}
        columns={[
          {
            key: 'closed',
            label: t('reports.dateTimeCol'),
            value: (row) =>
              row.closedAt ? new Date(row.closedAt).toLocaleString() : '—',
            sort: (row) => new Date(row.closedAt ?? row.openedAt).getTime(),
            render: (row) =>
              row.closedAt ? (
                <ShiftLink
                  label={new Date(row.closedAt).toLocaleString()}
                  onOpenShift={onOpenShift}
                />
              ) : (
                '—'
              ),
          },
          {
            key: 'id',
            label: t('reports.shiftCol'),
            value: (row) => row.id,
          },
          {
            key: 'openedBy',
            label: t('reports.openedBy'),
            value: (row) => row.openedBy || '—',
            render: (row) =>
              row.openedBy ? (
                <EmployeeLink
                  name={row.openedBy}
                  employees={employees}
                  onOpenEmployee={onOpenEmployee}
                />
              ) : (
                '—'
              ),
          },
          {
            key: 'openingCash',
            label: t('reports.openingCash'),
            numeric: true,
            value: (row) => Number((row.openingCashUsdCents / 100).toFixed(2)),
          },
          {
            key: 'expectedCash',
            label: t('reports.expectedCash'),
            numeric: true,
            value: (row) =>
              row.expectedCashUsdCents == null
                ? ''
                : Number((row.expectedCashUsdCents / 100).toFixed(2)),
          },
          {
            key: 'countedCash',
            label: t('reports.countedCash'),
            numeric: true,
            value: (row) =>
              row.closingCashUsdCents == null
                ? ''
                : Number((row.closingCashUsdCents / 100).toFixed(2)),
          },
          {
            key: 'variance',
            label: t('reports.varianceCol'),
            numeric: true,
            value: (row) =>
              row.varianceUsdCents == null
                ? ''
                : Number((row.varianceUsdCents / 100).toFixed(2)),
            render: (row) =>
              row.varianceUsdCents == null ? (
                '—'
              ) : (
                <strong
                  className={
                    row.varianceUsdCents < 0
                      ? 'coral-text'
                      : row.varianceUsdCents > 0
                        ? 'amber-text'
                        : 'green-text'
                  }
                >
                  {row.varianceUsdCents < 0 ? '−' : ''}
                  {cents(Math.abs(row.varianceUsdCents))}
                </strong>
              ),
          },
          {
            key: 'status',
            label: t('orders.status'),
            value: (row) => row.status,
          },
        ]}
      />
    )
  }

  if (tab === 'audit') {
    if (auditRows === null)
      return (
        <section className="glass-panel report-detail-panel">
          <div className="empty-state">
            <span>{t('reports.loadingData')}</span>
          </div>
        </section>
      )
    return (
      <ReportDetailTable<AuditRow>
        {...shared}
        title={t('reports.auditLog')}
        emptyText={t('reports.noAuditEvents')}
        rows={auditRows}
        rowKey={(row) => String(row.id)}
        defaultSort={{ key: 'at', direction: 'desc' }}
        filters={[
          {
            key: 'employee',
            label: t('employees.employee'),
            get: (row) => row.employee,
          },
          {
            key: 'action',
            label: t('reports.actionCol'),
            get: (row) => row.action,
            options: auditActionGroups
              .filter((group) => group.id)
              .map((group) => t(group.key)),
          },
        ]}
        columns={[
          {
            key: 'at',
            label: t('dashboard.time'),
            value: (row) => new Date(row.at).toLocaleString(),
            sort: (row) => new Date(row.at).getTime(),
          },
          {
            key: 'employee',
            label: t('employees.employee'),
            value: (row) => row.employee,
            render: (row) => (
              <EmployeeLink
                name={row.employee}
                employees={employees}
                onOpenEmployee={onOpenEmployee}
              />
            ),
          },
          {
            key: 'action',
            label: t('reports.actionCol'),
            value: (row) => row.action,
          },
          {
            key: 'order',
            label: t('orders.order'),
            value: (row) => row.orderId || '',
            render: (row) =>
              row.orderId ? (
                <OrderLink id={row.orderId} onOpenOrder={onOpenOrder} />
              ) : (
                '—'
              ),
          },
          {
            key: 'details',
            label: t('reports.detailsCol'),
            value: (row) => describeDetails(row.details),
          },
        ]}
      />
    )
  }

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
            render: (row) => (
              <ProductNameLink
                id={products.find((item) => item.name === row.productName)?.id}
                name={row.productName}
                onOpenProduct={onOpenProduct}
              />
            ),
          },
          {
            key: 'category',
            label: t('catalog.category'),
            value: (row) => row.category || '—',
            compact: true,
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
            render: (row) =>
              row.recordedBy ? (
                <EmployeeLink
                  name={row.recordedBy}
                  employees={employees}
                  onOpenEmployee={onOpenEmployee}
                />
              ) : (
                '—'
              ),
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
            render: (row) => (
              <OrderLink id={row.order.id} onOpenOrder={onOpenOrder} />
            ),
          },
          {
            key: 'product',
            label: t('dashboard.product'),
            value: (row) => row.description,
            render: (row) => (
              <ProductNameLink
                id={row.productId}
                name={row.description}
                onOpenProduct={onOpenProduct}
              />
            ),
          },
          {
            key: 'category',
            label: t('catalog.category'),
            value: (row) => row.category,
            compact: true,
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
            render: (row) => statusPill(t, row.order.status),
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
            render: (row) => (
              <OrderLink id={row.order.id} onOpenOrder={onOpenOrder} />
            ),
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
            compact: true,
            value: (row) =>
              row.tenderedUsdCents === null
                ? ''
                : Number((row.tenderedUsdCents / 100).toFixed(2)),
          },
          {
            key: 'tenderKhr',
            label: t('reports.tenderedKhr'),
            numeric: true,
            compact: true,
            value: (row) => row.tenderedKhr ?? '',
          },
          {
            key: 'change',
            label: t('reports.changeGiven'),
            numeric: true,
            compact: true,
            value: (row) =>
              row.changeUsdCents === null
                ? ''
                : Number((row.changeUsdCents / 100).toFixed(2)),
          },
          {
            key: 'cashier',
            label: t('employees.employee'),
            value: (row) => row.order.cashier || '—',
            render: (row) =>
              row.order.cashier ? (
                <EmployeeLink
                  name={row.order.cashier}
                  employees={employees}
                  onOpenEmployee={onOpenEmployee}
                />
              ) : (
                '—'
              ),
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
              <OrderLink id={row.id} onOpenOrder={onOpenOrder} />
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
          compact: true,
          render: (row) =>
            row.customer ? (
              <CustomerLink
                name={row.customer.name}
                customers={customers}
                onOpenCustomer={onOpenCustomer}
              />
            ) : row.cashier ? (
              <EmployeeLink
                name={row.cashier}
                employees={employees}
                onOpenEmployee={onOpenEmployee}
              />
            ) : (
              '—'
            ),
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
          render: (row) => statusPill(t, row.status),
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
    case 'shifts':
      return t('reports.shiftRecords')
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
    case 'none':
      return { from: '', to: '' }
    default:
      return { from: today, to: today }
  }
}

/**
 * The chart-card slot for tabs whose "chart" is a number, not a series:
 * Losses (total money lost), the Audit log (event count + newest) and
 * Shifts (closed count + total variance). The detail table below carries
 * the rows, paginated and exportable like every other report.
 */
function LossesSummaryCard({ data }: { data: LossesReport | null }) {
  const { t } = useTranslation()
  if (!data)
    return (
      <div className="empty-state">
        <span>{t('reports.loadingData')}</span>
      </div>
    )
  return (
    <div className="report-summary-card">
      <strong>{cents(data.totalLostCents)}</strong>
      <span>{t('reports.totalLost')}</span>
      <small>{t('reports.lossesTitle')}</small>
    </div>
  )
}

function AuditSummaryCard({ rows }: { rows: AuditRow[] }) {
  const { t } = useTranslation()
  const newest = rows[0]
  return (
    <div className="report-summary-card">
      <strong>{rows.length}</strong>
      <span>{t('reports.auditLog')}</span>
      {newest && <small>{new Date(newest.at).toLocaleString()}</small>}
    </div>
  )
}

function ShiftsSummaryCard({ shifts }: { shifts: Shift[] }) {
  const { t } = useTranslation()
  const variance = shifts.reduce(
    (sum, shift) => sum + (shift.varianceUsdCents ?? 0),
    0,
  )
  return (
    <div className="report-summary-card">
      <strong>{shifts.length}</strong>
      <span>{t('reports.shiftRecords')}</span>
      <small className={variance < 0 ? 'coral-text' : 'green-text'}>
        {variance < 0 ? '−' : ''}
        {cents(Math.abs(variance))} {t('reports.cashVariance')}
      </small>
    </div>
  )
}

function TopProductsTable({
  onOpenProduct,
}: {
  onOpenProduct?: (productId: number) => void
}) {
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
          <ProductNameLink
            id={product.id}
            name={product.name}
            onOpenProduct={onOpenProduct}
          />
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

/**
 * Employee accountability: normal sales numbers next to the anti-theft
 * signals (discounts, voids, refunds, cash-variance history). Rows with a
 * repeated negative-variance pattern are flagged for the owner.
 */
function TeamAccountability({
  from,
  to,
  rows,
  onlyEmployee,
}: {
  from: string
  to: string
  /** Pre-fetched rows (the page fetches them for the By-employee view);
      when omitted the component fetches its own, as before. */
  rows?: CashierBreakdownRow[] | null
  /** When set, only this employee's block renders (drill-down view). */
  onlyEmployee?: string
}) {
  const { t } = useTranslation()
  const [fetched, setFetched] = useState<CashierBreakdownRow[] | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  useEffect(() => {
    if (rows !== undefined) return
    let alive = true
    apiRequest<CashierBreakdownRow[]>(
      `/api/reports/cashiers?from=${from}&to=${to}`,
    )
      .then((data) => alive && setFetched(data))
      .catch(() => alive && setFetched([]))
    return () => {
      alive = false
    }
  }, [from, to, rows])
  const all = rows ?? fetched
  const visible = onlyEmployee
    ? (all ?? []).filter((row) => row.name === onlyEmployee)
    : (all ?? [])
  if (!all)
    return (
      <div className="empty-state">
        <span>{t('reports.loadingData')}</span>
      </div>
    )
  if (!visible.length)
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
      {visible.map((row) => (
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
