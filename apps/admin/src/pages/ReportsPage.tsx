import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, CalendarDays, Download, FileSpreadsheet, Lightbulb, TrendingUp } from 'lucide-react'
import { categories, products, revenueData } from '../data'

export default function ReportsPage({ onToast }: { onToast: (message: string) => void }) {
  const [tab, setTab] = useState('Sales')

  return (
    <div className="page-content">
      <section className="reports-header">
        <div className="filter-tabs report-tabs">{['Sales', 'Products', 'Payments', 'Team', 'Waste'].map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div>
        <div className="toolbar-actions"><button className="secondary-button"><CalendarDays size={16} /> Aug 14 – Aug 20</button><button className="primary-button" onClick={() => onToast(`${tab} report exported`)}><Download size={16} /> Export report</button></div>
      </section>

      <section className="report-kpi-row">
        <ReportKpi label="Net sales" value="$6,658" change="+14.2%" up detail="vs previous 7 days" />
        <ReportKpi label="Gross profit" value="$4,126" change="+11.8%" up detail="62.0% margin" />
        <ReportKpi label="Orders" value="268" change="+8.7%" up detail="$24.84 average" />
        <ReportKpi label="Waste cost" value="$92" change="−18.3%" up detail="1.4% of net sales" />
      </section>

      <section className="report-main-grid">
        <div className="glass-panel report-chart-card">
          <div className="panel-heading"><div><span className="section-kicker">7-day comparison</span><h2>{tab === 'Waste' ? 'Waste cost trend' : 'Sales & gross profit'}</h2></div><div className="dual-legend"><span><i className="sales" />Sales</span><span><i className="profit" />Gross profit</span></div></div>
          <ComparisonChart waste={tab === 'Waste'} />
        </div>
        <div className="glass-panel insight-panel">
          <div className="insight-icon"><Lightbulb size={20} /></div><span className="section-kicker">Owner insight</span><h2>Saturday is your strongest production opportunity.</h2><p>Saturday generated 18.7% more sales than your 7-day average. Strawberry Cloud sold out by 3:40 PM.</p>
          <div className="insight-metric"><TrendingUp size={18} /><div><strong>Recommended action</strong><span>Increase Saturday Strawberry Cloud production from 22 to 26 units.</span></div></div>
          <button className="secondary-button full-button" onClick={() => onToast('Production recommendation saved')}>Save recommendation</button>
        </div>
      </section>

      <section className="report-bottom-grid">
        <div className="glass-panel category-report">
          <div className="panel-heading"><div><span className="section-kicker">Contribution</span><h2>Sales by category</h2></div><button className="text-button">View breakdown</button></div>
          <div className="category-report-list">
            {categories.map((category, index) => <div key={category.name}><span className="rank">{index + 1}</span><div><strong>{category.name}</strong><i><b style={{ width: `${category.revenue / 19}%`, background: category.color }} /></i></div><span><strong>${category.revenue.toLocaleString()}</strong><small>{Math.round(category.revenue / 56)}%</small></span></div>)}
          </div>
        </div>
        <div className="glass-panel margin-report">
          <div className="panel-heading"><div><span className="section-kicker">Menu engineering</span><h2>Product profitability</h2></div></div>
          <div className="margin-row table-head"><span>Product</span><span>Revenue</span><span>Margin</span></div>
          {products.slice(0, 5).map((product) => <div className="margin-row" key={product.id}><div className="catalog-product"><span className="catalog-image small" style={{ backgroundPosition: product.imagePosition }} /><strong>{product.name}</strong></div><strong>${product.revenue}</strong><span className={`margin-pill ${product.id === 4 ? 'amber' : ''}`}>{product.id === 4 ? '54%' : `${64 + product.id}%`}</span></div>)}
        </div>
      </section>

      <section className="glass-panel report-library">
        <div className="panel-heading"><div><span className="section-kicker">Downloads</span><h2>Report library</h2></div></div>
        <div className="report-library-grid">
          {['Daily sales summary', 'Product sell-through', 'Payment reconciliation', 'Shift variance', 'Freshness & waste', 'Employee performance'].map((name) => <button key={name} onClick={() => onToast(`${name} prepared`)}><FileSpreadsheet size={19} /><span><strong>{name}</strong><small>CSV · Updated now</small></span><Download size={16} /></button>)}
        </div>
      </section>
    </div>
  )
}

function ReportKpi({ label, value, change, up, detail }: { label: string; value: string; change: string; up: boolean; detail: string }) {
  return <article className="glass-panel report-kpi"><span>{label}</span><strong>{value}</strong><div className={up ? 'green-text' : 'coral-text'}>{up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}<b>{change}</b><small>{detail}</small></div></article>
}

function ComparisonChart({ waste }: { waste: boolean }) {
  return <div className="comparison-chart"><div className="bar-y-labels"><span>$1.5k</span><span>$1k</span><span>$500</span><span>$0</span></div><div className="bar-plot">{revenueData.map((item, index) => <div className="bar-group" key={item.day}><div className="bar-tooltip">${item.value}</div><div className="bars"><i className="sales-bar" style={{ height: `${waste ? 20 + index * 5 : item.value / 14}%` }} /><i className="profit-bar" style={{ height: `${waste ? 12 + index * 3 : item.value / 22}%` }} /></div><span>{item.day}</span></div>)}</div></div>
}
