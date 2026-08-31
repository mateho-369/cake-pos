import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Download, Search, X } from 'lucide-react'
import { useTranslation } from '../lib/i18n'
import TablePagination, {
  DEFAULT_PAGE_SIZE,
  pageCount,
  paginate,
  type PageSize,
} from './TablePagination'

/**
 * One column of a report detail table. `value` is the sortable/exportable
 * scalar; `render` is the optional richer cell (pills, sub-lines). Keeping
 * them separate means the on-screen table and the exported file can never
 * disagree about what a row says.
 */
export type DetailColumn<T> = {
  key: string
  label: string
  numeric?: boolean
  value: (row: T) => string | number
  /** Sort key when the displayed value sorts badly (dates, money strings). */
  sort?: (row: T) => string | number
  render?: (row: T) => ReactNode
}

/** A dropdown filter built from the distinct values of one field. */
export type DetailFilter<T> = {
  key: string
  label: string
  get: (row: T) => string
  /** Fixed option list; defaults to the distinct values present in the rows. */
  options?: string[]
}

export type DetailTableProps<T> = {
  title: string
  subtitle?: string
  rows: T[]
  columns: Array<DetailColumn<T>>
  filters?: Array<DetailFilter<T>>
  rowKey: (row: T, index: number) => string
  /** Column key + direction the table opens on. */
  defaultSort?: { key: string; direction: 'asc' | 'desc' }
  searchPlaceholder?: string
  /** Range currently selected at the top of Reports (for the export meta). */
  from: string
  to: string
  /** Called with the filtered/sorted rows when the admin asks to export. */
  onExport: (payload: {
    header: string[]
    rows: Array<Array<string | number>>
    filters: Array<{ label: string; value: string }>
    title: string
  }) => void
  /** Anything extra to show between the filters and the table. */
  children?: ReactNode
}

/**
 * The record-level ("database view") table used by every Reports tab that
 * has raw records worth browsing. It provides the three things the summary
 * rollups cannot: the individual rows behind the numbers, per-column
 * filtering/search so the admin can narrow down without leaving Reports,
 * and pagination so a busy period never dumps thousands of rows at once.
 * Export always hands the CURRENT filtered+sorted rows upward, so what you
 * see is exactly what gets downloaded.
 */
export default function ReportDetailTable<T>({
  title,
  subtitle,
  rows,
  columns,
  filters = [],
  rowKey,
  defaultSort,
  searchPlaceholder,
  from,
  to,
  onExport,
  children,
}: DetailTableProps<T>) {
  const { t } = useTranslation()
  const initial = defaultSort ?? {
    key: columns[0]?.key ?? '',
    direction: 'desc' as const,
  }
  const [sortKey, setSortKey] = useState(initial.key)
  const [direction, setDirection] = useState<'asc' | 'desc'>(initial.direction)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)

  // A new tab/report is a new question: reset sort, filters and page.
  useEffect(() => {
    setSortKey(initial.key)
    setDirection(initial.direction)
    setQuery('')
    setSelected({})
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title])
  useEffect(() => {
    setPage(1)
  }, [from, to, query, selected, pageSize])

  const options = useMemo(
    () =>
      filters.map((filter) => ({
        ...filter,
        values:
          filter.options ??
          [...new Set(rows.map((row) => filter.get(row)).filter(Boolean))].sort(
            (a, b) => a.localeCompare(b),
          ),
      })),
    [filters, rows],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      for (const filter of filters) {
        const wanted = selected[filter.key]
        if (wanted && filter.get(row) !== wanted) return false
      }
      if (!needle) return true
      return columns.some((column) =>
        String(column.value(row)).toLowerCase().includes(needle),
      )
    })
  }, [rows, filters, selected, query, columns])

  const sorted = useMemo(() => {
    const column = columns.find((item) => item.key === sortKey) ?? columns[0]
    if (!column) return filtered
    const factor = direction === 'asc' ? 1 : -1
    const key = column.sort ?? column.value
    return [...filtered].sort((a, b) => {
      const left = key(a)
      const right = key(b)
      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * factor
      }
      return String(left).localeCompare(String(right)) * factor
    })
  }, [filtered, columns, sortKey, direction])

  const pages = pageCount(sorted.length, pageSize)
  const currentPage = Math.min(page, pages)
  const visible = paginate(sorted, currentPage, pageSize)
  const activeFilters = [
    ...(query.trim()
      ? [{ label: t('common.search'), value: query.trim() }]
      : []),
    ...filters
      .filter((filter) => selected[filter.key])
      .map((filter) => ({
        label: filter.label,
        value: selected[filter.key],
      })),
  ]
  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setDirection(direction === 'asc' ? 'desc' : 'asc')
      return
    }
    const column = columns.find((item) => item.key === key)
    setSortKey(key)
    setDirection(column?.numeric || key === 'date' ? 'desc' : 'asc')
  }
  const requestExport = () =>
    onExport({
      title,
      header: columns.map((column) => column.label),
      rows: sorted.map((row) => columns.map((column) => column.value(row))),
      filters: activeFilters,
    })

  return (
    <section className="glass-panel report-detail-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">{t('reports.detailKicker')}</span>
          <h2>{title}</h2>
          {subtitle && <small className="report-detail-note">{subtitle}</small>}
        </div>
        <button className="text-button" onClick={requestExport}>
          <Download size={14} /> {t('reports.reviewAndExport')}
        </button>
      </div>
      <div className="report-detail-filters">
        <label className="inline-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder ?? t('reports.searchRecords')}
          />
        </label>
        {options.map((filter) => (
          <label key={filter.key} className="report-detail-filter">
            <span>{filter.label}</span>
            <select
              value={selected[filter.key] ?? ''}
              onChange={(event) =>
                setSelected((current) => ({
                  ...current,
                  [filter.key]: event.target.value,
                }))
              }
            >
              <option value="">{t('common.all')}</option>
              {filter.values.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ))}
        {activeFilters.length > 0 && (
          <button
            type="button"
            className="text-button report-detail-clear"
            onClick={() => {
              setQuery('')
              setSelected({})
            }}
          >
            <X size={13} /> {t('common.clear')}
          </button>
        )}
      </div>
      {children}
      {!sorted.length ? (
        <div className="empty-state">
          <span>{t('reports.noTransactions')}</span>
        </div>
      ) : (
        <>
          <div className="table-responsive">
            <table className="report-detail-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={column.numeric ? 'numeric' : undefined}
                      aria-sort={
                        sortKey === column.key
                          ? direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <button
                        type="button"
                        className={`detail-sort ${sortKey === column.key ? 'active' : ''}`}
                        onClick={() => toggleSort(column.key)}
                      >
                        {column.label}
                        {sortKey === column.key &&
                          (direction === 'asc' ? (
                            <ChevronUp size={12} />
                          ) : (
                            <ChevronDown size={12} />
                          ))}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => (
                  <tr key={rowKey(row, index)}>
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={column.numeric ? 'numeric' : undefined}
                      >
                        {column.render
                          ? column.render(row)
                          : String(column.value(row))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            total={sorted.length}
            page={currentPage}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        </>
      )}
    </section>
  )
}
