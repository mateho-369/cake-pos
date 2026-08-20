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
  PackageCheck,
  ReceiptText,
  ScanLine,
  ShoppingBag,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { orders, products, revenueData, type PageId } from '../data'

type DashboardProps = {
  onNavigate: (page: PageId) => void
  onOrder: (id: string) => void
  onToast: (message: string) => void
}

export default function Dashboard({ onNavigate, onOrder, onToast }: DashboardProps) {
  const [period, setPeriod] = useState('Today')

  const exportSummary = () => {
    const content = 'Metric,Value\nNet sales,1224.50\nOrders,47\nAverage order,26.05\nExpiring units,5\n'
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' }))
    link.download = 'atelier-daily-summary.csv'
    link.click()
    URL.revokeObjectURL(link.href)
    onToast('Daily summary exported')
  }

  return (
    <div className="page-content dashboard-page">
      <section className="page-toolbar">
        <div className="segmented-control" aria-label="Date range">
          {['Today', '7 days', '30 days'].map((item) => (
            <button className={period === item ? 'active' : ''} onClick={() => setPeriod(item)} key={item}>{item}</button>
          ))}
        </div>
        <div className="toolbar-actions">
          <button className="secondary-button"><CalendarDays size={16} /> Aug 20, 2026</button>
          <button className="secondary-button" onClick={exportSummary}><Download size={16} /> Export</button>
        </div>
      </section>

      <section className="kpi-grid">
        <MetricCard
          label="Net sales"
          value="$1,224.50"
          compare="12.4%"
          positive
          note="vs. $1,089 yesterday"
          icon={<WalletCards size={19} />}
          tone="pink"
        />
        <MetricCard
          label="Orders"
          value="47"
          compare="8.2%"
          positive
          note="4 above daily pace"
          icon={<ReceiptText size={19} />}
          tone="blue"
        />
        <MetricCard
          label="Average order"
          value="$26.05"
          compare="3.8%"
          positive
          note="2.1 items per basket"
          icon={<ShoppingBag size={19} />}
          tone="violet"
        />
        <MetricCard
          label="Freshness risk"
          value="5 units"
          compare="2 more"
          positive={false}
          note="$146 retail value at risk"
          icon={<CircleAlert size={19} />}
          tone="amber"
          alert
        />
      </section>

      <section className="dashboard-primary-grid">
        <div className="glass-panel revenue-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Sales performance</span>
              <h2>Revenue trend</h2>
            </div>
            <div className="chart-legend"><i /><span>Net sales</span><strong>$6,658</strong></div>
          </div>
          <RevenueChart />
          <div className="chart-summary">
            <div><span>7-day average</span><strong>$951</strong></div>
            <div><span>Highest day</span><strong>Saturday · $1,328</strong></div>
            <div><span>Forecast today</span><strong>$1,410</strong></div>
          </div>
        </div>

        <div className="glass-panel attention-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker coral-text">Needs attention</span>
              <h2>Freshness queue</h2>
            </div>
            <button className="text-button" onClick={() => onNavigate('freshness')}>View all <ChevronRight size={15} /></button>
          </div>
          <p className="panel-description">Prioritized by first-expired, first-out.</p>
          <div className="attention-list">
            {products.filter((product) => ['Expires today', '1 day left'].includes(product.status)).map((product) => (
              <div className="attention-item" key={product.id}>
                <ProductThumb position={product.imagePosition} />
                <div className="attention-copy">
                  <strong>{product.name}</strong>
                  <span>{product.stock} units · ${product.stock * product.price} value</span>
                </div>
                <span className={`freshness-badge ${product.status === 'Expires today' ? 'danger' : 'warning'}`}>{product.status}</span>
              </div>
            ))}
            <div className="waste-projection">
              <div className="waste-ring"><span>$146</span></div>
              <div><strong>Value currently at risk</strong><span>Move 5 units today to avoid projected waste.</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-secondary-grid">
        <div className="glass-panel product-performance">
          <div className="panel-heading">
            <div><span className="section-kicker">Product mix</span><h2>Top sellers today</h2></div>
            <button className="text-button" onClick={() => onNavigate('reports')}>Full report <ChevronRight size={15} /></button>
          </div>
          <div className="product-table table-responsive">
            <div className="table-row table-head"><span>Product</span><span>Units</span><span>Revenue</span><span>Sell-through</span></div>
            {products.slice(0, 4).map((product, index) => (
              <div className="table-row" key={product.id}>
                <div className="product-cell"><span className="rank">{index + 1}</span><ProductThumb position={product.imagePosition} /><div><strong>{product.name}</strong><small>{product.category}</small></div></div>
                <span className="numeric">{product.sold}</span>
                <strong className="numeric">${product.revenue}</strong>
                <div className="progress-cell"><span><i style={{ width: `${Math.min(94, 50 + product.sold * 2)}%` }} /></span><small>{Math.min(94, 50 + product.sold * 2)}%</small></div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel payment-card">
          <div className="panel-heading"><div><span className="section-kicker">Payments</span><h2>Channel split</h2></div></div>
          <div className="donut-wrap">
            <div className="donut-chart"><div><strong>$1.2k</strong><span>processed</span></div></div>
            <div className="payment-legend">
              <div><i className="khqr" /><span>KHQR</span><strong>$771.43</strong><small>63%</small></div>
              <div><i className="cash" /><span>Cash</span><strong>$453.07</strong><small>37%</small></div>
            </div>
          </div>
          <div className="settlement-note"><ScanLine size={17} /><div><strong>KHQR settlement is on track</strong><span>29 payments manually confirmed today</span></div></div>
        </div>
      </section>

      <section className="dashboard-bottom-grid">
        <div className="glass-panel recent-orders">
          <div className="panel-heading">
            <div><span className="section-kicker">Live activity</span><h2>Recent orders</h2></div>
            <button className="text-button" onClick={() => onNavigate('orders')}>All orders <ChevronRight size={15} /></button>
          </div>
          <div className="orders-mini-table table-responsive">
            <div className="table-row table-head"><span>Order</span><span>Time</span><span>Cashier</span><span>Payment</span><span>Total</span></div>
            {orders.slice(0, 5).map((order) => (
              <button className="table-row order-row-button" key={order.id} onClick={() => onOrder(order.id)}>
                <strong>{order.id}</strong><span>{order.time}</span><span>{order.cashier}</span><span className="payment-pill">{order.payment === 'KHQR' ? <ScanLine size={14} /> : <Banknote size={14} />}{order.payment}</span><strong className="numeric">${order.total.toFixed(2)}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="glass-panel shift-pulse">
          <div className="panel-heading"><div><span className="section-kicker">Operations</span><h2>Current shift</h2></div><span className="live-badge"><i /> Live</span></div>
          <div className="shift-time"><Clock3 size={19} /><div><strong>2h 47m</strong><span>Opened at 7:55 AM</span></div></div>
          <div className="shift-people">
            <div><span className="avatar pink">SC</span><span><strong>Sophea</strong><small>24 orders · $648</small></span></div>
            <div><span className="avatar blue">DL</span><span><strong>Dara</strong><small>23 orders · $576</small></span></div>
          </div>
          <div className="cash-position"><span><Banknote size={16} /> Expected cash</span><strong>$553.07</strong><small>Includes $100 opening float</small></div>
          <button className="secondary-button full-button" onClick={() => onNavigate('shifts')}>Open shift details <ChevronRight size={15} /></button>
        </div>
      </section>
    </div>
  )
}

function MetricCard({ label, value, compare, positive, note, icon, tone, alert = false }: {
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
    <article className={`metric-card glass-panel ${alert ? 'metric-alert' : ''}`}>
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <div className="metric-top"><span>{label}</span><button aria-label={`${label} details`}>•••</button></div>
      <div className="metric-value">{value}</div>
      <div className={`metric-compare ${positive ? 'positive' : 'negative'}`}>
        {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        <strong>{compare}</strong><span>{note}</span>
      </div>
    </article>
  )
}

function ProductThumb({ position }: { position: string }) {
  return <span className="product-thumb" style={{ backgroundPosition: position }} />
}

function RevenueChart() {
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
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const area = `${line} L ${points[points.length - 1].x} 190 L ${points[0].x} 190 Z`

  return (
    <div className="chart-container">
      <div className="chart-y-labels"><span>$1.4k</span><span>$700</span><span>$0</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Seven day revenue chart">
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
        {[28, 108, 188].map((y) => <line key={y} x1="0" y1={y} x2={width} y2={y} className="chart-gridline" />)}
        <path d={area} fill="url(#areaFill)" />
        <path d={line} fill="none" stroke="url(#lineStroke)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {points.map((point, index) => <circle key={point.day} cx={point.x} cy={point.y} r={index === points.length - 1 ? 5 : 3.5} className={index === points.length - 1 ? 'chart-point active' : 'chart-point'} />)}
      </svg>
      <div className="chart-x-labels">{points.map((point) => <span key={point.day}>{point.day}</span>)}</div>
    </div>
  )
}
