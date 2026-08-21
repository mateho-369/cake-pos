import { useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  ReceiptText,
  ScanLine,
  ShoppingBag,
  Sparkles,
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
  const { orders, products, revenueData } = useAdminData()
  const completed = orders.filter((order) => order.status === 'Completed')
  const netRevenue = completed.reduce((sum, order) => sum + order.total, 0)
  const averageOrder = completed.length ? netRevenue / completed.length : 0
  const money = (value: number) =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const [period, setPeriod] = useState('today')
  const periods = [
    { id: 'today', label: 'dashboard.today' },
    { id: 'sevenDays', label: 'dashboard.sevenDays' },
    { id: 'thirtyDays', label: 'dashboard.thirtyDays' },
  ]
  const exportSummary = () => {
    const content = [
      `${t('dashboard.netSales')},${t('dashboard.revenue')}`,
      `${t('dashboard.netSales')},${netRevenue.toFixed(2)}`,
      `${t('dashboard.orders')},${completed.length}`,
      `${t('dashboard.averageOrder')},${averageOrder.toFixed(2)}`,
      `${t('dashboard.freshnessRisk')},${products.filter((product) => ['Expires today', '1 day left'].includes(product.status)).length}`,
    ].join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' }))
    link.download = 'atelier-daily-summary.csv'
    link.click()
    URL.revokeObjectURL(link.href)
    onToast(t('header.backupComplete'))
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
          <button className="secondary-button">
            <CalendarDays size={16} /> {t('dashboard.date')}
          </button>
          <button className="secondary-button" onClick={exportSummary}>
            <Download size={16} /> {t('common.export')}
          </button>
        </div>
      </section>
      <section className="kpi-grid">
        <MetricCard
          label={t('dashboard.netSales')}
          value={money(netRevenue)}
          compare="12.4%"
          positive
          note={t('dashboard.yesterday')}
          icon={<WalletCards size={19} />}
          tone="pink"
        />
        <MetricCard
          label={t('dashboard.orders')}
          value={String(completed.length)}
          compare="8.2%"
          positive
          note={t('dashboard.dailyPace')}
          icon={<ReceiptText size={19} />}
          tone="blue"
        />
        <MetricCard
          label={t('dashboard.averageOrder')}
          value={money(averageOrder)}
          compare="3.8%"
          positive
          note={t('dashboard.basket')}
          icon={<ShoppingBag size={19} />}
          tone="violet"
        />
        <MetricCard
          label={t('dashboard.freshnessRisk')}
          value="5 units"
          compare="2 more"
          positive={false}
          note={t('dashboard.riskValue')}
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
              <strong>$6,658</strong>
            </div>
          </div>
          <RevenueChart />
          <div className="chart-summary">
            <div>
              <span>{t('dashboard.sevenDayAverage')}</span>
              <strong>$951</strong>
            </div>
            <div>
              <span>{t('dashboard.highestDay')}</span>
              <strong>{t('dashboard.sat')} · $1,328</strong>
            </div>
            <div>
              <span>{t('dashboard.forecastToday')}</span>
              <strong>$1,410</strong>
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
                <span>$146</span>
              </div>
              <div>
                <strong>{t('dashboard.valueAtRisk')}</strong>
                <span>{t('dashboard.moveUnits')}</span>
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
                  <span>
                    <i
                      style={{
                        width: `${Math.min(94, 50 + product.sold * 2)}%`,
                      }}
                    />
                  </span>
                  <small>{Math.min(94, 50 + product.sold * 2)}%</small>
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
            <div className="donut-chart">
              <div>
                <strong>$1.2k</strong>
                <span>{t('dashboard.processed')}</span>
              </div>
            </div>
            <div className="payment-legend">
              <div>
                <i className="khqr" />
                <span>{t('payment.khqr')}</span>
                <strong>$771.43</strong>
                <small>63%</small>
              </div>
              <div>
                <i className="cash" />
                <span>{t('dashboard.cash')}</span>
                <strong>$453.07</strong>
                <small>37%</small>
              </div>
            </div>
          </div>
          <div className="settlement-note">
            <ScanLine size={17} />
            <div>
              <strong>{t('dashboard.settlementOnTrack')}</strong>
              <span>{t('dashboard.paymentsConfirmed')}</span>
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
              <strong>{t('dashboard.shiftDuration')}</strong>
              <span>{t('dashboard.openedAt')}</span>
            </div>
          </div>
          <div className="shift-people">
            <div>
              <span className="avatar pink">SC</span>
              <span>
                <strong>Sophea</strong>
                <small>
                  {t('dashboard.staffOrders', { count: 24, amount: '648' })}
                </small>
              </span>
            </div>
            <div>
              <span className="avatar blue">DL</span>
              <span>
                <strong>Dara</strong>
                <small>
                  {t('dashboard.staffOrders', { count: 23, amount: '576' })}
                </small>
              </span>
            </div>
          </div>
          <div className="cash-position">
            <span>
              <Banknote size={16} /> {t('dashboard.expectedCash')}
            </span>
            <strong>$553.07</strong>
            <small>{t('dashboard.openingFloat')}</small>
          </div>
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
  compare: string
  positive: boolean
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
      <div className={`metric-compare ${positive ? 'positive' : 'negative'}`}>
        {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        <strong>{compare}</strong>
        <span>{note}</span>
      </div>
    </article>
  )
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
  const max = 1400
  const padX = 14
  const plotH = 170
  const points = revenueData.map((item, index) => ({
    ...item,
    x: padX + index * ((width - padX * 2) / (revenueData.length - 1)),
    y: 186 - (item.value / max) * plotH,
  }))
  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
  const area = `${line} L ${points[points.length - 1].x} 190 L ${points[0].x} 190 Z`
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  return (
    <div className="chart-container">
      <div className="chart-y-labels">
        <span>$1.4k</span>
        <span>$700</span>
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
          <span key={point.day}>{t(`dashboard.${days[index]}`)}</span>
        ))}
      </div>
    </div>
  )
}
