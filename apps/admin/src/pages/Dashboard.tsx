import { useEffect, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  ReceiptText,
  ScanLine,
  ShoppingBag,
  WalletCards,
} from 'lucide-react'
import { type PageId } from '../data'
import { translateCategory, useTranslation } from '../lib/i18n'
import { useAdminData } from '../lib/data'

type DashboardProps = {
  onNavigate: (page: PageId) => void
  onOrder: (id: string) => void
  onToast: (message: string) => void
}

export default function Dashboard({
  onNavigate,
  onOrder,
  onToast,
}: DashboardProps) {
  const { t } = useTranslation()
  const {
    orders,
    products,
    revenueData,
    summary,
    currentShift,
    loadDashboard,
  } = useAdminData()
  const completed = orders.filter((order) => order.status === 'Completed')
  const netRevenue = summary?.todaySalesTotal ?? 0
  const completedOrders = summary?.todayOrdersCount ?? completed.length
  const averageOrder =
    completedOrders > 0 && netRevenue ? netRevenue / completedOrders : 0
  const chartTotal = revenueData.reduce((sum, point) => sum + point.value, 0)
  const chartAverage = revenueData.length ? chartTotal / revenueData.length : 0
  const highestChart = revenueData.reduce(
    (max, point) => Math.max(max, point.value),
    0,
  )
  const cashRevenue = (summary?.cashRevenueCents ?? 0) / 100
  const qrRevenue = (summary?.qrRevenueCents ?? 0) / 100
  const qrPaymentCount = summary?.qrPaymentCount ?? 0
  const paymentTotal = cashRevenue + qrRevenue
  const cashPercent = paymentTotal ? (cashRevenue / paymentTotal) * 100 : 0
  const qrPercent = paymentTotal ? (qrRevenue / paymentTotal) * 100 : 0
  const freshnessRisk = products.filter((product) =>
    ['Expires today', '1 day left'].includes(product.status),
  )
  const atRiskValue = freshnessRisk.reduce(
    (sum, product) => sum + product.stock * product.price,
    0,
  )
  const atRiskUnits = freshnessRisk.reduce(
    (sum, product) => sum + product.stock,
    0,
  )
  const yesterdaySales = summary?.yesterdaySalesTotal ?? 0
  const itemsPerBasket =
    completedOrders > 0 && summary?.itemsSold
      ? summary.itemsSold / completedOrders
      : 0
  // Daily pace: today's completed orders vs the average of the earlier days in
  // the selected window. Both values come from the real per-day series.
  const ordersData = summary?.ordersData ?? []
  const priorDays = ordersData.slice(0, -1)
  const priorAverage = priorDays.length
    ? priorDays.reduce((sum, point) => sum + point.value, 0) / priorDays.length
    : null
  const pace =
    priorAverage === null
      ? null
      : Math.round((completedOrders - priorAverage) * 10) / 10
  // Percentage change of the last day vs the previous day (used for 7/30-day
  // periods, where "vs yesterday" is not meaningful).
  const lastDayChange =
    revenueData.length >= 2 && revenueData[revenueData.length - 2].value
      ? ((revenueData[revenueData.length - 1].value -
          revenueData[revenueData.length - 2].value) /
          revenueData[revenueData.length - 2].value) *
        100
      : null
  const shiftOpenedAt = currentShift?.openedAt
    ? new Date(currentShift.openedAt)
    : null
  const shiftDuration = shiftOpenedAt
    ? formatDuration(Date.now() - shiftOpenedAt.getTime())
    : null
  const shiftOpeningFloat = currentShift
    ? (currentShift.openingCashUsdCents ?? 0) / 100
    : 0
  const money = (value: number) =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  type PeriodId = 'today' | 'seven_days' | 'thirty_days'
  const [period, setPeriod] = useState<PeriodId>('today')
  const periods: Array<{ id: PeriodId; label: string }> = [
    { id: 'today', label: 'dashboard.today' },
    { id: 'seven_days', label: 'dashboard.sevenDays' },
    { id: 'thirty_days', label: 'dashboard.thirtyDays' },
  ]
  useEffect(() => {
    void loadDashboard(period)
  }, [period, loadDashboard])
  const exportSummary = () => {
    // CSV/Excel reports are deliberately English so any spreadsheet program
    // opens them with stable, machine-readable headers (the UI language may
    // be Khmer). The UTF-8 BOM makes Excel detect the encoding correctly.
    const content = [
      'Metric,Value',
      `Net sales,${netRevenue.toFixed(2)}`,
      `Orders,${completedOrders}`,
      `Average order,${averageOrder.toFixed(2)}`,
      `Freshness risk,${freshnessRisk.length}`,
    ].join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(
      new Blob(['\uFEFF' + content], {
        type: 'text/csv;charset=utf-8;',
      }),
    )
    link.download = 'atelier-daily-summary.csv'
    link.click()
    URL.revokeObjectURL(link.href)
    onToast(t('dashboard.exported'))
  }
  return (
    <div className="page-content dashboard-page">
      <section className="page-toolbar">
        <div
          className="segmented-control"
          aria-label={t('dashboard.dateRange')}
        >
          {periods.map((item) => (
            <button
              className={period === item.id ? 'active' : ''}
              onClick={() => setPeriod(item.id)}
              key={item.id}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <button className="secondary-button" onClick={exportSummary}>
            <Download size={16} /> {t('common.export')}
          </button>
        </div>
      </section>
      <section className="kpi-grid">
        <MetricCard
          label={t('dashboard.netSales')}
          value={money(netRevenue)}
          compare={
            period === 'today'
              ? yesterdaySales > 0
                ? `$${yesterdaySales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : undefined
              : lastDayChange !== null
                ? `${lastDayChange >= 0 ? '+' : ''}${lastDayChange.toFixed(1)}%`
                : undefined
          }
          positive={
            period === 'today'
              ? yesterdaySales > 0
                ? netRevenue >= yesterdaySales
                : undefined
              : lastDayChange === null
                ? undefined
                : lastDayChange >= 0
          }
          note={
            period === 'today'
              ? t('dashboard.yesterday')
              : t('dashboard.vsPreviousDay')
          }
          icon={<WalletCards size={19} />}
          tone="pink"
        />
        <MetricCard
          label={t('dashboard.orders')}
          value={String(completedOrders)}
          compare={
            pace === null || pace === 0 ? undefined : `${Math.abs(pace)}`
          }
          positive={pace === null ? undefined : pace > 0}
          note={
            pace === null
              ? t('dashboard.paceUnknown')
              : pace === 0
                ? t('dashboard.atPace')
                : pace > 0
                  ? t('dashboard.abovePace')
                  : t('dashboard.belowPace')
          }
          icon={<ReceiptText size={19} />}
          tone="blue"
        />
        <MetricCard
          label={t('dashboard.averageOrder')}
          value={money(averageOrder)}
          note={
            completedOrders > 0
              ? t('dashboard.basket', {
                  count: itemsPerBasket.toFixed(1),
                })
              : t('dashboard.paceUnknown')
          }
          icon={<ShoppingBag size={19} />}
          tone="violet"
        />
        <MetricCard
          label={t('dashboard.freshnessRisk')}
          value={`${freshnessRisk.length} units`}
          note={t('dashboard.riskValue', {
            value: atRiskValue.toFixed(2),
          })}
          icon={<CircleAlert size={19} />}
          tone="amber"
          alert
        />
      </section>
      <section className="dashboard-primary-grid">
        <div className="glass-panel revenue-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                {t('dashboard.salesPerformance')}
              </span>
              <h2>{t('dashboard.revenueTrend')}</h2>
            </div>
            <div className="chart-legend">
              <i />
              <span>{t('dashboard.netSalesShort')}</span>
              <strong>{money(chartTotal)}</strong>
            </div>
          </div>
          <RevenueChart />
          <div className="chart-summary">
            <div>
              <span>{t('dashboard.periodAverage')}</span>
              <strong>{money(chartAverage)}</strong>
            </div>
            <div>
              <span>{t('dashboard.highestDay')}</span>
              <strong>{money(highestChart)}</strong>
            </div>
            <div>
              <span>{t('dashboard.latestDay')}</span>
              <strong>
                {money(
                  revenueData.length
                    ? revenueData[revenueData.length - 1].value
                    : 0,
                )}
              </strong>
            </div>
          </div>
        </div>
        <div className="glass-panel attention-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker coral-text">
                {t('dashboard.needsAttention')}
              </span>
              <h2>{t('dashboard.freshnessQueue')}</h2>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate('freshness')}
            >
              {t('dashboard.viewAll')} <ChevronRight size={15} />
            </button>
          </div>
          <p className="panel-description">{t('dashboard.prioritized')}</p>
          <div className="attention-list">
            {products
              .filter((product) =>
                ['Expires today', '1 day left'].includes(product.status),
              )
              .map((product) => (
                <div className="attention-item" key={product.id}>
                  <ProductThumb position={product.imagePosition} />
                  <div className="attention-copy">
                    <strong>{product.name}</strong>
                    <span>
                      {t('dashboard.unitsAtRisk', {
                        count: product.stock,
                        value: product.stock * product.price,
                      })}
                    </span>
                  </div>
                  <span
                    className={`freshness-badge ${product.status === 'Expires today' ? 'danger' : 'warning'}`}
                  >
                    {statusLabel(t, product.status)}
                  </span>
                </div>
              ))}
            <div className="waste-projection">
              <div className="waste-ring">
                <span>{money(atRiskValue)}</span>
              </div>
              <div>
                <strong>{t('dashboard.valueAtRisk')}</strong>
                <span>
                  {atRiskUnits > 0
                    ? t('dashboard.moveUnits', { count: atRiskUnits })
                    : t('dashboard.noUnitsAtRisk')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="dashboard-secondary-grid">
        <div className="glass-panel product-performance">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                {t('dashboard.productMix')}
              </span>
              <h2>{t('dashboard.topSellers')}</h2>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate('reports')}
            >
              {t('dashboard.fullReport')} <ChevronRight size={15} />
            </button>
          </div>
          <div className="product-table table-responsive">
            <div className="table-row table-head">
              <span>{t('dashboard.product')}</span>
              <span>{t('dashboard.units')}</span>
              <span>{t('dashboard.revenue')}</span>
              <span>{t('dashboard.sellThrough')}</span>
            </div>
            {products.slice(0, 4).map((product, index) => (
              <div className="table-row" key={product.id}>
                <div className="product-cell">
                  <span className="rank">{index + 1}</span>
                  <ProductThumb position={product.imagePosition} />
                  <div>
                    <strong>{product.name}</strong>
                    <small>{translateCategory(t, product.category)}</small>
                  </div>
                </div>
                <span className="numeric">{product.sold}</span>
                <strong className="numeric">${product.revenue}</strong>
                <div className="progress-cell">
                  {(() => {
                    const total = product.stock + product.sold
                    const rate = total
                      ? Math.min(100, (product.sold / total) * 100)
                      : 0
                    return (
                      <>
                        <span>
                          <i style={{ width: `${rate}%` }} />
                        </span>
                        <small>{rate.toFixed(0)}%</small>
                      </>
                    )
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-panel payment-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">{t('dashboard.payments')}</span>
              <h2>{t('dashboard.channelSplit')}</h2>
            </div>
          </div>
          <div className="donut-wrap">
            <div
              className="donut-chart"
              style={{
                background:
                  paymentTotal > 0
                    ? `conic-gradient(var(--pink) 0 ${qrPercent}%, var(--blue) ${qrPercent}% 100%)`
                    : '#eee8eb',
              }}
            >
              <div>
                <strong>{money(paymentTotal || 0)}</strong>
                <span>{t('dashboard.processed')}</span>
              </div>
            </div>
            <div className="payment-legend">
              <div>
                <i className="khqr" />
                <span>{t('payment.khqr')}</span>
                <strong>{money(qrRevenue)}</strong>
                <small>{qrPercent.toFixed(0)}%</small>
              </div>
              <div>
                <i className="cash" />
                <span>{t('dashboard.cash')}</span>
                <strong>{money(cashRevenue)}</strong>
                <small>{cashPercent.toFixed(0)}%</small>
              </div>
            </div>
          </div>
          <div className="settlement-note">
            <ScanLine size={17} />
            <div>
              <strong>{t('dashboard.settlementOnTrack')}</strong>
              <span>
                {qrPaymentCount > 0
                  ? t('dashboard.paymentsConfirmed', {
                      count: qrPaymentCount,
                    })
                  : t('dashboard.noQrPayments')}
              </span>
            </div>
          </div>
        </div>
      </section>
      <section className="dashboard-bottom-grid">
        <div className="glass-panel recent-orders">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                {t('dashboard.liveActivity')}
              </span>
              <h2>{t('dashboard.recentOrders')}</h2>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate('orders')}
            >
              {t('dashboard.allOrders')} <ChevronRight size={15} />
            </button>
          </div>
          <div className="orders-mini-table table-responsive">
            <div className="table-row table-head">
              <span>{t('dashboard.order')}</span>
              <span>{t('dashboard.time')}</span>
              <span>{t('dashboard.cashier')}</span>
              <span>{t('dashboard.payment')}</span>
              <span>{t('dashboard.revenue')}</span>
            </div>
            {orders.slice(0, 5).map((order) => (
              <button
                className="table-row order-row-button"
                key={order.id}
                onClick={() => onOrder(order.id)}
              >
                <strong>{order.id}</strong>
                <span>{order.time}</span>
                <span>{order.cashier}</span>
                <span className="payment-pill">
                  {order.payment === 'KHQR' ? (
                    <ScanLine size={14} />
                  ) : (
                    <Banknote size={14} />
                  )}
                  {paymentLabel(t, order.payment)}
                </span>
                <strong className="numeric">${order.total.toFixed(2)}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="glass-panel shift-pulse">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                {t('dashboard.operations')}
              </span>
              <h2>{t('dashboard.currentShift')}</h2>
            </div>
            <span className="live-badge">
              <i /> {t('dashboard.live')}
            </span>
          </div>
          <div className="shift-time">
            <Clock3 size={19} />
            <div>
              <strong>
                {currentShift && shiftDuration
                  ? shiftDuration
                  : t('shifts.noActive')}
              </strong>
              <span>
                {currentShift && shiftOpenedAt
                  ? t('dashboard.openedAtTime', {
                      time: shiftOpenedAt.toLocaleTimeString('en', {
                        hour: 'numeric',
                        minute: '2-digit',
                      }),
                    })
                  : t('shifts.noActive')}
              </span>
            </div>
          </div>
          {currentShift ? (
            <>
              <div className="shift-people">
                <div>
                  <span className="avatar pink">
                    {initialsOf(currentShift.openedBy || '')}
                  </span>
                  <span>
                    <strong>{currentShift.openedBy || '—'}</strong>
                    <small>
                      {new Date(currentShift.openedAt).toLocaleString()}
                    </small>
                  </span>
                </div>
              </div>
              <div className="cash-position">
                <span>
                  <Banknote size={16} /> {t('dashboard.expectedCash')}
                </span>
                <strong>
                  $
                  {(
                    (currentShift.expectedCashUsdCents ??
                      currentShift.openingCashUsdCents) / 100
                  ).toFixed(2)}
                </strong>
                <small>
                  {t('dashboard.openingFloat', {
                    amount: shiftOpeningFloat.toFixed(2),
                  })}
                </small>
              </div>
            </>
          ) : (
            <div className="cash-position">
              <span>
                <Banknote size={16} /> {t('dashboard.expectedCash')}
              </span>
              <strong>$0.00</strong>
              <small>{t('shifts.noActive')}</small>
            </div>
          )}
          <button
            className="secondary-button full-button"
            onClick={() => onNavigate('shifts')}
          >
            {t('dashboard.shiftDetails')} <ChevronRight size={15} />
          </button>
        </div>
      </section>
    </div>
  )
}

function MetricCard({
  label,
  value,
  compare,
  positive,
  note,
  icon,
  tone,
  alert = false,
}: {
  label: string
  value: string
  compare?: string
  positive?: boolean
  note: string
  icon: React.ReactNode
  tone: string
  alert?: boolean
}) {
  return (
    <article
      className={`metric-card glass-panel ${alert ? 'metric-alert' : ''}`}
    >
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <div className="metric-top">
        <span>{label}</span>
        <button aria-label={label}>•••</button>
      </div>
      <div className="metric-value">{value}</div>
      {compare ? (
        <div className={`metric-compare ${positive ? 'positive' : 'negative'}`}>
          {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          <strong>{compare}</strong>
          <span>{note}</span>
        </div>
      ) : (
        <div className="metric-compare neutral">
          <span>{note}</span>
        </div>
      )}
    </article>
  )
}
function moneyLabel(value: number) {
  return value >= 1000
    ? `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
    : `$${value.toFixed(0)}`
}
function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
function formatDuration(milliseconds: number) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`
}
function ProductThumb({ position }: { position: string }) {
  return (
    <span className="product-thumb" style={{ backgroundPosition: position }} />
  )
}
function paymentLabel(
  t: (key: string, variables?: Record<string, string | number>) => string,
  payment: string | null,
) {
  return payment === 'KHQR'
    ? t('payment.khqr')
    : payment === 'Cash'
      ? t('payment.cash')
      : 'Pending'
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
function RevenueChart() {
  const { t } = useTranslation()
  const { revenueData } = useAdminData()
  const width = 700
  const height = 210
  const max = Math.max(1, ...revenueData.map((point) => point.value))
  const padX = 14
  const plotH = 170
  // Data starts empty while the dashboard request is in flight, and a new
  // installation can legitimately return only today's point. Avoid indexing
  // an empty array and keep a single point centred (rather than dividing by 0).
  const pointSpacing =
    revenueData.length > 1 ? (width - padX * 2) / (revenueData.length - 1) : 0
  const points = revenueData.map((item, index) => ({
    ...item,
    x: revenueData.length === 1 ? width / 2 : padX + index * pointSpacing,
    y: 186 - (item.value / max) * plotH,
  }))
  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
  const area = points.length
    ? `${line} L ${points[points.length - 1].x} 190 L ${points[0].x} 190 Z`
    : ''
  return (
    <div className="chart-container">
      <div className="chart-y-labels">
        <span>{moneyLabel(max)}</span>
        <span>{moneyLabel(max / 2)}</span>
        <span>$0</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-label={t('dashboard.chartLabel')}
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f472b6" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#be185d" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        {[28, 108, 188].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2={width}
            y2={y}
            className="chart-gridline"
          />
        ))}
        <path d={area} fill="url(#areaFill)" />
        <path
          d={line}
          fill="none"
          stroke="url(#lineStroke)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((point, index) => (
          <circle
            key={point.day}
            cx={point.x}
            cy={point.y}
            r={index === points.length - 1 ? 5 : 3.5}
            className={
              index === points.length - 1 ? 'chart-point active' : 'chart-point'
            }
          />
        ))}
      </svg>
      <div className="chart-x-labels">
        {points.map((point, index) => (
          <span key={point.day}>{formatChartDay(point.day)}</span>
        ))}
      </div>
    </div>
  )
}

function formatChartDay(day: string) {
  const [year, month, date] = day.split('-')
  if (!date) return day
  const parsed = new Date(`${year}-${month}-${date}T00:00:00`)
  return parsed.toLocaleDateString('en', {
    day: 'numeric',
    month: 'short',
  })
}
