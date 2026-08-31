import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Download,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
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
  /** Hide the column in the condensed tablet layout (641–1024px). It stays
      visible in the stacked mobile cards, so no data is lost. */
  compact?: boolean
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

/** Minimal matchMedia hook — jsdom-safe, desktop by default. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [query])
  return matches
}

/**
 * The record-level ("database view") table used by every Reports tab that
 * has raw records worth browsing. It provides the three things the summary
 * rollups cannot: the individual rows behind the numbers, per-column
 * filtering/search so the admin can narrow down without leaving Reports,
 * and pagination so a busy period never dumps thousands of rows at once.
 * Export always hands the CURRENT filtered+sorted rows upward, so what you
 * see is exactly what gets downloaded.
 *
 * Filters live in a single "Filters (n)" popover: the panel edits a draft,
 * which applies immediately on desktop and behind an Apply button when the
 * panel renders as a mobile bottom sheet. Applied filters appear as
 * removable chips, and the empty state distinguishes "this period has no
 * records" from "these filters match nothing", so a stale filter can never
 * masquerade as an empty period again.
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
  // Popover state: open flag plus the draft the panel edits. Desktop applies
  // the draft live; the mobile bottom sheet only applies on the Apply press.
  const [filterOpen, setFilterOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const isMobile = useMediaQuery('(max-width: 640px)')
  const panelRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)

  // A new tab/report is a new question: reset sort, filters and page.
  useEffect(() => {
    setSortKey(initial.key)
    setDirection(initial.direction)
    setQuery('')
    setSelected({})
    setPage(1)
    setDraft({})
    setFilterOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title])
  useEffect(() => {
    setPage(1)
  }, [from, to, query, selected, pageSize])

  // The popover closes on Escape and on any press outside trigger + panel.
  useEffect(() => {
    if (!filterOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterOpen(false)
    }
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        panelRef.current?.contains(target) ||
        controlsRef.current?.contains(target)
      )
        return
      setFilterOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [filterOpen])

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
  const activeFilterCount =
    (query.trim() ? 1 : 0) +
    filters.filter((filter) => selected[filter.key]).length
  const hasActiveFilters = activeFilters.length > 0
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
  const openPanel = () => {
    setDraft({ ...selected })
    setFilterOpen(true)
  }
  const closePanel = () => setFilterOpen(false)
  const updateDraft = (next: Record<string, string>) => {
    setDraft(next)
    if (!isMobile) setSelected(next)
  }
  const clearAllFilters = () => {
    setQuery('')
    setSelected({})
    setDraft({})
    setFilterOpen(false)
  }
  const applyDraft = () => {
    setSelected(draft)
    setFilterOpen(false)
  }
  const removeFilter = (key: string) => {
    setSelected((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }
  const cellClass = (column: DetailColumn<T>) =>
    [column.numeric ? 'numeric' : '', column.compact ? 'compact' : '']
      .filter(Boolean)
      .join(' ') || undefined

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
        <div className="report-detail-filter-controls" ref={controlsRef}>
          <button
            type="button"
            className="report-filter-trigger"
            aria-haspopup="dialog"
            aria-expanded={filterOpen}
            onClick={() => (filterOpen ? closePanel() : openPanel())}
          >
            <SlidersHorizontal size={14} />
            {t('reports.filtersLabel')} ({activeFilterCount})
          </button>
          {query.trim() !== '' && (
            <span className="report-filter-chip">
              {t('common.search')}: {query.trim()}
              <button
                type="button"
                aria-label={`${t('common.clear')}: ${t('common.search')}`}
                onClick={() => setQuery('')}
              >
                <X size={12} />
              </button>
            </span>
          )}
          {filters
            .filter((filter) => selected[filter.key])
            .map((filter) => (
              <span className="report-filter-chip" key={filter.key}>
                {filter.label}: {selected[filter.key]}
                <button
                  type="button"
                  aria-label={`${t('common.clear')}: ${filter.label}`}
                  onClick={() => removeFilter(filter.key)}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          {hasActiveFilters && (
            <button
              type="button"
              className="text-button report-detail-clear"
              onClick={clearAllFilters}
            >
              <X size={13} /> {t('common.clear')}
            </button>
          )}
        </div>
        {filterOpen && (
          <>
            <div className="report-filter-backdrop" onClick={closePanel} />
            <div
              className="report-filter-panel"
              role="dialog"
              aria-label={t('reports.filtersLabel')}
              ref={panelRef}
            >
              <div className="report-filter-panel-head">
                <strong>{t('reports.filtersLabel')}</strong>
                <button
                  type="button"
                  className="icon-button"
                  onClick={closePanel}
                  aria-label={t('modal.close')}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="report-filter-fields">
                {options.map((filter) => (
                  <label key={filter.key} className="report-filter-field">
                    <span>{filter.label}</span>
                    <select
                      value={draft[filter.key] ?? ''}
                      onChange={(event) =>
                        updateDraft({
                          ...draft,
                          [filter.key]: event.target.value,
                        })
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
              </div>
              <div className="report-filter-panel-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => updateDraft({})}
                >
                  {t('reports.clearFilters')}
                </button>
                {isMobile && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={applyDraft}
                  >
                    {t('reports.apply')}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      {children}
      {!sorted.length ? (
        rows.length === 0 ? (
          <div className="empty-state">
            <span>{t('reports.noTransactions')}</span>
          </div>
        ) : (
          <div className="empty-state report-detail-empty">
            <span>{t('reports.noRecordsMatch')}</span>
            <small>
              {t('reports.unfilteredCount', { count: rows.length })}
            </small>
            <button
              type="button"
              className="text-button report-detail-clear"
              onClick={clearAllFilters}
            >
              <X size={13} /> {t('common.clear')}
            </button>
          </div>
        )
      ) : (
        <>
          <div className="table-responsive">
            <table className="report-detail-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={cellClass(column)}
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
                        data-label={column.label}
                        className={cellClass(column)}
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
