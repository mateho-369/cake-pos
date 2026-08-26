import { useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  FileText,
  Lightbulb,
  TrendingUp,
} from 'lucide-react'
import type { RevenuePoint } from '../data'
import { useAdminData } from '../lib/data'
import { translateCategory, useTranslation } from '../lib/i18n'
import {
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
  const { categories, products, revenueData, orders, summary, freshness } =
    useAdminData()
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
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(today.slice(0, 8) + '01')
  const [to, setTo] = useState(today)
  const selectedOrders = ordersInRange(orders, from, to)
  const tabs = [
    { id: 'sales', label: 'reports.sales' },
    { id: 'products', label: 'reports.products' },
    { id: 'payments', label: 'reports.payments' },
    { id: 'team', label: 'reports.team' },
    { id: 'waste', label: 'reports.waste' },
  ]
  const libraries = [
    { key: 'dailySummary', label: 'reports.dailySummary' },
    { key: 'sellThrough', label: 'reports.sellThrough' },
    { key: 'reconciliation', label: 'reports.reconciliation' },
    { key: 'shiftVariance', label: 'reports.shiftVariance' },
    { key: 'freshWaste', label: 'reports.freshWaste' },
    { key: 'employeePerformance', label: 'reports.employeePerformance' },
  ]
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
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            To
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
              <h2>
                {tab === 'waste'
                  ? t('reports.wasteTrend')
                  : t('reports.salesTrend')}
              </h2>
            </div>
            <div className="dual-legend">
              <span>
                <i className="sales" />
                {tab === 'waste' ? t('reports.wasteCost') : t('reports.sales')}
              </span>
            </div>
          </div>
          <ComparisonChart waste={tab === 'waste'} />
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
              onClick={() => {
                onToast(t('reports.prepared', { name: t(item.label) }))
                void (
                  item.key === 'dailySummary'
                    ? exportSummaryWord(selectedOrders, from, to)
                    : exportOrdersExcel(selectedOrders, from, to)
                ).catch((error) => onToast(error.message))
              }}
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
