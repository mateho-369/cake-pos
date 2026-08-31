/**
 * The Reports catalogue, shared by the page and the sidebar.
 *
 * The sidebar's Reports nav item expands into ONE dropdown that lists every
 * report. Every report is the same shape: a paginated, filterable record
 * table with a Review & export action, and rows that drill through to the
 * underlying record (order, product, employee, shift) — the QuickBooks
 * "QuickZoom" pattern: summary first, then the transactions behind it.
 */
export const REPORT_TABS = [
  { id: 'sales', labelKey: 'reports.sales' },
  { id: 'products', labelKey: 'reports.products' },
  { id: 'payments', labelKey: 'reports.payments' },
  { id: 'team', labelKey: 'reports.team' },
  { id: 'waste', labelKey: 'reports.waste' },
  { id: 'losses', labelKey: 'reports.losses' },
  { id: 'shifts', labelKey: 'reports.shifts' },
  { id: 'audit', labelKey: 'reports.auditLog' },
] as const

export type ReportTabId = (typeof REPORT_TABS)[number]['id']
