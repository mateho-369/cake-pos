import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslation, type TranslationFunction } from '../lib/i18n'
import type { Order, WasteEvent } from '../data'
import ReportDetailTable, {
  type DetailColumn,
  type DetailTableProps,
} from './ReportDetailTable'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * Where a breakdown row drills to. The "stay in Reports" kinds open the
 * record table behind the number (QuickZoom); the others navigate to the
 * thing's own page (product editor, customer panel, categories page).
 */
export type BreakdownDrill =
  | { kind: 'date'; value: string; label: string }
  | { kind: 'hour'; value: string; label: string }
  | { kind: 'method'; value: string; label: string }
  | { kind: 'cashier'; value: string; label: string }
  | { kind: 'reason'; value: string; label: string }
  | { kind: 'category'; value: string; label: string }
  | { kind: 'customer'; value: string; label: string }
  | { kind: 'product'; value: string; label: string }

export type BreakdownRow = {
  key: string
  label: string
  orders: number
  units: number
  net: number
  drill?: BreakdownDrill
}

export type ViewByOption = { id: string; labelKey: string }

export const SALES_VIEWS: ViewByOption[] = [
  { id: 'day', labelKey: 'reports.viewDay' },
  { id: 'hour', labelKey: 'reports.viewHour' },
  { id: 'category', labelKey: 'reports.viewCategory' },
  { id: 'customer', labelKey: 'reports.viewCustomer' },
  { id: 'product', labelKey: 'reports.viewProduct' },
]
export const PRODUCTS_VIEWS: ViewByOption[] = [
  { id: 'product', labelKey: 'reports.viewProduct' },
  { id: 'category', labelKey: 'reports.viewCategory' },
  { id: 'day', labelKey: 'reports.viewDay' },
]
export const PAYMENTS_VIEWS: ViewByOption[] = [
  { id: 'day', labelKey: 'reports.viewDay' },
  { id: 'method', labelKey: 'reports.viewMethod' },
]
export const TEAM_VIEWS: ViewByOption[] = [
  { id: 'employee', labelKey: 'reports.viewEmployee' },
  { id: 'day', labelKey: 'reports.viewDay' },
]
export const WASTE_VIEWS: ViewByOption[] = [
  { id: 'day', labelKey: 'reports.viewDay' },
  { id: 'product', labelKey: 'reports.viewProduct' },
  { id: 'reason', labelKey: 'reports.viewReason' },
]
export const VIEWS_BY_TAB: Record<string, ViewByOption[]> = {
  sales: SALES_VIEWS,
  products: PRODUCTS_VIEWS,
  payments: PAYMENTS_VIEWS,
  team: TEAM_VIEWS,
  waste: WASTE_VIEWS,
}
export const DEFAULT_VIEWS: Record<string, string> = {
  sales: 'day',
  products: 'product',
  payments: 'day',
  team: 'employee',
  waste: 'day',
}

/** The report endpoints the breakdown tables read, fetched per date range. */
export type BreakdownData = {
  trend: Array<{ period: string; netRevenueCents: number }>
  peakHours: Array<{ hour: number; orders: number; revenueCents: number }>
  categories: Array<{
    category: string
    units: number
    netRevenueCents: number
    orders?: number
  }>
  customers: Array<{
    customer_id: number
    orders: number
    netRevenueCents: number
    lastOrderAt: string
  }>
  products: Array<{
    product_id: number | null
    snapshotName: string
    quantity: number
    netRevenueCents: number
  }>
  payments: Array<{
    method: string
    transactions: number
    amount_usd_cents: number
  }>
  cashiers: CashierBreakdownRow[] | null
}

/**
 * Per-employee accountability row (`/api/reports/cashiers`): the normal
 * sales numbers PLUS the anti-theft signals used by the Team drill-down.
 */
export type CashierBreakdownRow = {
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

/* ------------------------------------------------------------------ */
/* View-by dropdown                                                    */
/* ------------------------------------------------------------------ */

export function ViewByDropdown({
  value,
  options,
  onChange,
}: {
  value: string
  options: ViewByOption[]
  onChange: (id: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])
  const current = options.find((option) => option.id === value) ?? options[0]
  return (
    <div className="view-by-dropdown" ref={ref}>
      <button
        type="button"
        className="view-by-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span>
          {t('reports.viewBy')}: <strong>{t(current.labelKey)}</strong>
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="view-by-menu" role="menu">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              className={option.id === value ? 'active' : ''}
              onClick={() => {
                setOpen(false)
                onChange(option.id)
              }}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Breakdown table (ReportDetailTable with the export row below)       */
/* ------------------------------------------------------------------ */

export type BreakdownTableProps = {
  title: string
  subtitle?: string
  rows: BreakdownRow[]
  columns: Array<DetailColumn<BreakdownRow>>
  from: string
  to: string
  emptyText?: string
  defaultSort?: { key: string; direction: 'asc' | 'desc' }
  onExport: DetailTableProps<BreakdownRow>['onExport']
  /** Called when a drillable first column is clicked. */
  onRowClick?: (row: BreakdownRow) => void
}

export function BreakdownTable({
  title,
  subtitle,
  rows,
  columns,
  from,
  to,
  emptyText,
  defaultSort,
  onExport,
  onRowClick,
}: BreakdownTableProps) {
  // The first column IS the drill: make it a link whenever the row has
  // somewhere to go, plain text otherwise.
  const drilledColumns = columns.map((column) =>
    column.key === 'dimension'
      ? {
          ...column,
          render: (row: BreakdownRow): ReactNode =>
            row.drill && onRowClick ? (
              <button
                type="button"
                className="record-link"
                onClick={() => onRowClick(row)}
                title={row.label}
              >
                {row.label}
              </button>
            ) : (
              <strong>{row.label}</strong>
            ),
        }
      : column,
  )
  return (
    <ReportDetailTable<BreakdownRow>
      title={title}
      subtitle={subtitle}
      rows={rows}
      columns={drilledColumns}
      rowKey={(row) => row.key}
      defaultSort={defaultSort}
      from={from}
      to={to}
      emptyText={emptyText}
      onExport={onExport}
      exportPlacement="below"
    />
  )
}

/* ------------------------------------------------------------------ */
/* Breakdown builders                                                  */
/* ------------------------------------------------------------------ */

const localDay = (iso: string): string => {
  const date = new Date(iso)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
const hourLabel = (hour: number | string): string =>
  `${String(hour).padStart(2, '0')}:00`
const money = (cents: number): number => Number((cents / 100).toFixed(2))

/** Completed orders count as sales, matching the backend `paid()` scope. */
const paidOrders = (orders: Order[]): Order[] =>
  orders.filter((order) => order.status === 'Completed')

function dimensionColumn(t: TranslationFunction, label: string) {
  return {
    key: 'dimension',
    label,
    value: (row: BreakdownRow) => row.label,
    sort: (row: BreakdownRow) => row.label,
  } satisfies DetailColumn<BreakdownRow>
}
function secondColumn(
  t: TranslationFunction,
  kind: 'orders' | 'units' | 'events',
) {
  const label =
    kind === 'units'
      ? t('dashboard.units')
      : kind === 'events'
        ? t('reports.eventsCol')
        : t('reports.ordersCol')
  const value =
    kind === 'units'
      ? (row: BreakdownRow) => row.units
      : kind === 'events'
        ? (row: BreakdownRow) => row.units
        : (row: BreakdownRow) => row.orders
  return {
    key: 'second',
    label,
    numeric: true,
    value,
  } satisfies DetailColumn<BreakdownRow>
}
function netColumn(t: TranslationFunction, label: string) {
  return {
    key: 'net',
    label,
    numeric: true,
    value: (row: BreakdownRow) => row.net,
    render: (row: BreakdownRow): ReactNode => (
      <strong className="numeric">${row.net.toFixed(2)}</strong>
    ),
  } satisfies DetailColumn<BreakdownRow>
}

export function buildBreakdown(input: {
  tab: string
  view: string
  data: BreakdownData
  orders: Order[]
  waste: WasteEvent[]
  customers: Array<{ id: number; name: string }>
  products: Array<{ id: number; name: string }>
  t: TranslationFunction
}): {
  columns: Array<DetailColumn<BreakdownRow>>
  rows: BreakdownRow[]
  defaultSort: { key: string; direction: 'asc' | 'desc' }
} {
  const { tab, view, data, orders, waste, customers, products, t } = input
  const paid = paidOrders(orders)
  const customerName = (id: number): string =>
    customers.find((customer) => customer.id === id)?.name ?? `#${id}`
  const productIdByName = new Map(products.map((item) => [item.name, item.id]))
  const dayOrders = new Map<
    string,
    { orders: number; net: number; units: number }
  >()
  for (const order of paid) {
    const day = localDay(order.createdAt)
    const bucket = dayOrders.get(day) ?? { orders: 0, net: 0, units: 0 }
    bucket.orders += 1
    bucket.net += order.total
    bucket.units += order.items
    dayOrders.set(day, bucket)
  }

  if (tab === 'sales') {
    const second = secondColumn(t, 'orders')
    const net = netColumn(t, t('reports.netSales'))
    if (view === 'hour') {
      const rows: BreakdownRow[] = data.peakHours.map((row) => ({
        key: `hour-${row.hour}`,
        label: hourLabel(row.hour),
        orders: Number(row.orders),
        units: 0,
        net: money(row.revenueCents),
        drill: {
          kind: 'hour',
          value: String(row.hour),
          label: `${t('reports.viewHour')} · ${hourLabel(row.hour)}`,
        },
      }))
      return {
        columns: [dimensionColumn(t, t('reports.viewHour')), second, net],
        rows,
        defaultSort: { key: 'dimension', direction: 'asc' },
      }
    }
    if (view === 'category') {
      const rows: BreakdownRow[] = data.categories.map((row) => ({
        key: `cat-${row.category}`,
        label: row.category,
        orders: Number(row.orders ?? 0),
        units: Number(row.units),
        net: money(row.netRevenueCents),
        drill: {
          kind: 'category',
          value: row.category,
          label: `${t('reports.viewCategory')} · ${row.category}`,
        },
      }))
      return {
        columns: [dimensionColumn(t, t('reports.viewCategory')), second, net],
        rows,
        defaultSort: { key: 'net', direction: 'desc' },
      }
    }
    if (view === 'customer') {
      const rows: BreakdownRow[] = data.customers.map((row) => {
        const name = customerName(row.customer_id)
        return {
          key: `cust-${row.customer_id}`,
          label: name,
          orders: Number(row.orders),
          units: 0,
          net: money(row.netRevenueCents),
          drill: {
            kind: 'customer',
            value: String(row.customer_id),
            label: `${t('reports.viewCustomer')} · ${name}`,
          },
        }
      })
      return {
        columns: [dimensionColumn(t, t('reports.viewCustomer')), second, net],
        rows,
        defaultSort: { key: 'net', direction: 'desc' },
      }
    }
    if (view === 'product') {
      const rows: BreakdownRow[] = data.products.map((row) => ({
        key: `prod-${row.product_id ?? row.snapshotName}`,
        label: row.snapshotName,
        orders: 0,
        units: Number(row.quantity),
        net: money(row.netRevenueCents),
        drill:
          row.product_id != null
            ? {
                kind: 'product',
                value: String(row.product_id),
                label: `${t('reports.viewProduct')} · ${row.snapshotName}`,
              }
            : undefined,
      }))
      return {
        columns: [
          dimensionColumn(t, t('reports.viewProduct')),
          secondColumn(t, 'units'),
          net,
        ],
        rows,
        defaultSort: { key: 'net', direction: 'desc' },
      }
    }
    // day (default)
    const rows: BreakdownRow[] = data.trend.map((row) => ({
      key: `day-${row.period}`,
      label: row.period,
      orders: dayOrders.get(row.period)?.orders ?? 0,
      units: 0,
      net: money(row.netRevenueCents),
      drill: {
        kind: 'date',
        value: row.period,
        label: `${t('reports.viewDay')} · ${row.period}`,
      },
    }))
    return {
      columns: [dimensionColumn(t, t('reports.viewDay')), second, net],
      rows,
      defaultSort: { key: 'dimension', direction: 'asc' },
    }
  }

  if (tab === 'products') {
    const net = netColumn(t, t('reports.netSales'))
    if (view === 'category') {
      const rows: BreakdownRow[] = data.categories.map((row) => ({
        key: `cat-${row.category}`,
        label: row.category,
        orders: Number(row.orders ?? 0),
        units: Number(row.units),
        net: money(row.netRevenueCents),
        drill: {
          kind: 'category',
          value: row.category,
          label: `${t('reports.viewCategory')} · ${row.category}`,
        },
      }))
      return {
        columns: [
          dimensionColumn(t, t('reports.viewCategory')),
          secondColumn(t, 'units'),
          net,
        ],
        rows,
        defaultSort: { key: 'net', direction: 'desc' },
      }
    }
    if (view === 'day') {
      const rows: BreakdownRow[] = [...dayOrders.entries()].map(
        ([day, bucket]) => ({
          key: `day-${day}`,
          label: day,
          orders: bucket.orders,
          units: bucket.units,
          net: money(Math.round(bucket.net * 100)),
          drill: {
            kind: 'date',
            value: day,
            label: `${t('reports.viewDay')} · ${day}`,
          },
        }),
      )
      return {
        columns: [
          dimensionColumn(t, t('reports.viewDay')),
          secondColumn(t, 'units'),
          net,
        ],
        rows,
        defaultSort: { key: 'dimension', direction: 'asc' },
      }
    }
    // product (default)
    const rows: BreakdownRow[] = data.products.map((row) => ({
      key: `prod-${row.product_id ?? row.snapshotName}`,
      label: row.snapshotName,
      orders: 0,
      units: Number(row.quantity),
      net: money(row.netRevenueCents),
      drill:
        row.product_id != null
          ? {
              kind: 'product',
              value: String(row.product_id),
              label: `${t('reports.viewProduct')} · ${row.snapshotName}`,
            }
          : undefined,
    }))
    return {
      columns: [
        dimensionColumn(t, t('reports.viewProduct')),
        secondColumn(t, 'units'),
        net,
      ],
      rows,
      defaultSort: { key: 'net', direction: 'desc' },
    }
  }

  if (tab === 'payments') {
    const second = secondColumn(t, 'orders')
    const net = netColumn(t, t('reports.netSales'))
    if (view === 'method') {
      const rows: BreakdownRow[] = data.payments.map((row) => ({
        key: `method-${row.method}`,
        label: row.method,
        orders: Number(row.transactions),
        units: 0,
        net: money(row.amount_usd_cents),
        drill: {
          kind: 'method',
          value: row.method,
          label: `${t('reports.viewMethod')} · ${row.method}`,
        },
      }))
      return {
        columns: [dimensionColumn(t, t('reports.viewMethod')), second, net],
        rows,
        defaultSort: { key: 'net', direction: 'desc' },
      }
    }
    // day (default)
    const rows: BreakdownRow[] = [...dayOrders.entries()].map(
      ([day, bucket]) => ({
        key: `day-${day}`,
        label: day,
        orders: bucket.orders,
        units: 0,
        net: money(Math.round(bucket.net * 100)),
        drill: {
          kind: 'date',
          value: day,
          label: `${t('reports.viewDay')} · ${day}`,
        },
      }),
    )
    return {
      columns: [dimensionColumn(t, t('reports.viewDay')), second, net],
      rows,
      defaultSort: { key: 'dimension', direction: 'asc' },
    }
  }

  if (tab === 'team') {
    const second = secondColumn(t, 'orders')
    const net = netColumn(t, t('reports.netSales'))
    if (view === 'day') {
      const rows: BreakdownRow[] = [...dayOrders.entries()].map(
        ([day, bucket]) => ({
          key: `day-${day}`,
          label: day,
          orders: bucket.orders,
          units: 0,
          net: money(Math.round(bucket.net * 100)),
          drill: {
            kind: 'date',
            value: day,
            label: `${t('reports.viewDay')} · ${day}`,
          },
        }),
      )
      return {
        columns: [dimensionColumn(t, t('reports.viewDay')), second, net],
        rows,
        defaultSort: { key: 'dimension', direction: 'asc' },
      }
    }
    // employee (default)
    const rows: BreakdownRow[] = (data.cashiers ?? []).map((row) => ({
      key: `emp-${row.cashier_id}`,
      label: row.name,
      orders: Number(row.completedOrderCount),
      units: 0,
      net: money(row.netRevenueCents),
      drill: {
        kind: 'cashier',
        value: row.name,
        label: `${t('reports.viewEmployee')} · ${row.name}`,
      },
    }))
    return {
      columns: [dimensionColumn(t, t('reports.viewEmployee')), second, net],
      rows,
      defaultSort: { key: 'net', direction: 'desc' },
    }
  }

  // waste tab
  const second = secondColumn(t, 'events')
  const net = netColumn(t, t('reports.retailValue'))
  if (view === 'product') {
    const groups = new Map<string, { events: number; value: number }>()
    for (const event of waste) {
      const bucket = groups.get(event.productName) ?? { events: 0, value: 0 }
      bucket.events += 1
      bucket.value += event.retailValue
      groups.set(event.productName, bucket)
    }
    const rows: BreakdownRow[] = [...groups.entries()].map(
      ([name, bucket]) => ({
        key: `waste-prod-${name}`,
        label: name,
        orders: 0,
        units: bucket.events,
        net: money(Math.round(bucket.value * 100)),
        drill: {
          kind: 'product',
          value: String(productIdByName.get(name) ?? ''),
          label: `${t('reports.viewProduct')} · ${name}`,
        },
      }),
    )
    return {
      columns: [dimensionColumn(t, t('reports.viewProduct')), second, net],
      rows,
      defaultSort: { key: 'net', direction: 'desc' },
    }
  }
  if (view === 'reason') {
    const groups = new Map<string, { events: number; value: number }>()
    for (const event of waste) {
      const bucket = groups.get(event.reason) ?? { events: 0, value: 0 }
      bucket.events += 1
      bucket.value += event.retailValue
      groups.set(event.reason, bucket)
    }
    const rows: BreakdownRow[] = [...groups.entries()].map(
      ([reason, bucket]) => ({
        key: `waste-reason-${reason}`,
        label: reason,
        orders: 0,
        units: bucket.events,
        net: money(Math.round(bucket.value * 100)),
        drill: {
          kind: 'reason',
          value: reason,
          label: `${t('reports.viewReason')} · ${reason}`,
        },
      }),
    )
    return {
      columns: [dimensionColumn(t, t('reports.viewReason')), second, net],
      rows,
      defaultSort: { key: 'net', direction: 'desc' },
    }
  }
  // day (default)
  const groups = new Map<string, { events: number; value: number }>()
  for (const event of waste) {
    const day = localDay(event.recordedAt)
    const bucket = groups.get(day) ?? { events: 0, value: 0 }
    bucket.events += 1
    bucket.value += event.retailValue
    groups.set(day, bucket)
  }
  const rows: BreakdownRow[] = [...groups.entries()].map(([day, bucket]) => ({
    key: `waste-day-${day}`,
    label: day,
    orders: 0,
    units: bucket.events,
    net: money(Math.round(bucket.value * 100)),
    drill: {
      kind: 'date',
      value: day,
      label: `${t('reports.viewDay')} · ${day}`,
    },
  }))
  return {
    columns: [dimensionColumn(t, t('reports.viewDay')), second, net],
    rows,
    defaultSort: { key: 'dimension', direction: 'asc' },
  }
}
