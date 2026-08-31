import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from '../lib/i18n'

/**
 * Page size options shared by every long admin table: the three fixed sizes
 * professional back-office reports offer, plus "All" for the admin who
 * really does want the whole range on one page (usually right before
 * printing or exporting).
 */
export const PAGE_SIZES = [25, 50, 100] as const
export type PageSize = (typeof PAGE_SIZES)[number] | 'all'
export const DEFAULT_PAGE_SIZE: PageSize = 25

/** Slice `rows` for the given 1-based page. 'all' returns everything. */
export function paginate<T>(rows: T[], page: number, size: PageSize): T[] {
  if (size === 'all') return rows
  const start = (page - 1) * size
  return rows.slice(start, start + size)
}

/** Total number of pages (never 0, so "Page 1 of 1" reads sanely). */
export function pageCount(total: number, size: PageSize): number {
  if (size === 'all') return 1
  return Math.max(1, Math.ceil(total / size))
}

/**
 * Footer control for any paginated table: rows-per-page picker, the
 * "Showing X–Y of Z" counter every accountant looks for, and prev/next.
 * It renders nothing when there is nothing to page through, so short
 * tables stay clean.
 */
export default function TablePagination({
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
}: {
  total: number
  page: number
  pageSize: PageSize
  onPage: (page: number) => void
  onPageSize: (size: PageSize) => void
}) {
  const { t } = useTranslation()
  const pages = pageCount(total, pageSize)
  const current = Math.min(Math.max(1, page), pages)
  const first =
    total === 0 ? 0 : pageSize === 'all' ? 1 : (current - 1) * pageSize + 1
  const last = pageSize === 'all' ? total : Math.min(total, current * pageSize)
  return (
    <div className="table-pagination">
      <label className="table-pagination-size">
        <span>{t('common.rowsPerPage')}</span>
        <select
          value={String(pageSize)}
          onChange={(event) => {
            const value = event.target.value
            onPageSize(value === 'all' ? 'all' : (Number(value) as PageSize))
            onPage(1)
          }}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
          <option value="all">{t('common.all')}</option>
        </select>
      </label>
      <span className="table-pagination-count">
        {total === 0
          ? t('common.showingNone')
          : t('common.showingRange', { from: first, to: last, total })}
      </span>
      <div className="table-pagination-nav">
        <button
          type="button"
          className="text-button"
          disabled={current <= 1}
          onClick={() => onPage(current - 1)}
        >
          <ChevronLeft size={14} /> {t('common.previous')}
        </button>
        <span className="table-pagination-page">
          {t('common.pageOf', { page: current, pages })}
        </span>
        <button
          type="button"
          className="text-button"
          disabled={current >= pages}
          onClick={() => onPage(current + 1)}
        >
          {t('common.next')} <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
