import type { Order } from '../data'
import {
  brandLogoPng,
  customLogoPng,
  defaultBranding,
  REPORT_FONT,
  reportStrings,
  type ReportBranding,
  type ReportLanguage,
} from './reportBranding'

/**
 * Everything the letterhead of a generated report needs: who the shop is,
 * what the report is, which slice of data it covers and which filters were
 * applied when the admin pressed Download. Passed by the export-preview
 * dialog so the file always matches exactly what was reviewed on screen.
 */
export type ExportMeta = {
  title: string
  subtitle?: string
  from: string
  to: string
  branding?: ReportBranding
  language?: ReportLanguage
  /** Active filter chips, reproduced on the document so it is self-describing. */
  filters?: Array<{ label: string; value: string }>
  /** Optional footer figures (totals, counts) printed under the table. */
  totals?: Array<{ label: string; value: string }>
  /** Shown instead of the generic "—" when the table has no rows. */
  emptyLabel?: string
}

const metaLines = (meta: ExportMeta, rowCount: number) => {
  const t = reportStrings(meta.language ?? 'en')
  const filters = meta.filters?.length
    ? meta.filters.map((f) => `${f.label}: ${f.value}`).join(' · ')
    : t.noFilters
  return [
    `${t.period}: ${meta.from || t.allDates} → ${meta.to || t.present}`,
    `${t.records}: ${rowCount}`,
    `${t.filters}: ${filters}`,
    `${t.generated}: ${new Date().toLocaleString()}`,
  ]
}

const brandingLines = (branding: ReportBranding) =>
  [branding.locationName, branding.address, branding.phone].filter(Boolean)

/**
 * Branded Word export of ANY report table (the on-screen detail table, a
 * library report, the sales summary). Letterhead first — logo, shop name,
 * contact block — then the report title, the period/filters/record count,
 * then the data as a real Word table. Labels follow the selected report
 * language; the Khmer font is applied to every run so the script renders.
 */
export async function exportTableWord(
  meta: ExportMeta,
  header: string[],
  rows: Array<Array<string | number>>,
  filename: string,
) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    ImageRun,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import('docx')
  const language = meta.language ?? 'en'
  const strings = reportStrings(language)
  const branding = meta.branding ?? defaultBranding
  const logo = branding?.logoUrl
    ? await customLogoPng(branding.logoUrl)
    : await brandLogoPng()
  const run = (text: string, options: Record<string, unknown> = {}) =>
    new TextRun({ text, font: REPORT_FONT, ...options })
  const cell = (
    text: string | number,
    options: { bold?: boolean; fill?: string; align?: boolean } = {},
  ) =>
    new TableCell({
      shading: options.fill
        ? { type: ShadingType.CLEAR, fill: options.fill, color: 'auto' }
        : undefined,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: [
        new Paragraph({
          alignment: options.align ? AlignmentType.RIGHT : undefined,
          children: [
            run(String(text), {
              bold: options.bold,
              color: options.fill ? 'FFFFFF' : undefined,
              size: 19,
            }),
          ],
        }),
      ],
    })
  const numericColumn = rows.length
    ? header.map((_, index) =>
        rows.every((row) => {
          const value = String(row[index] ?? '').replace(/[$,\s]/g, '')
          return value === '' || !Number.isNaN(Number(value))
        }),
      )
    : header.map(() => false)

  const letterhead: InstanceType<typeof Paragraph>[] = []
  if (logo) {
    letterhead.push(
      new Paragraph({
        children: [
          new ImageRun({
            type: 'png',
            data: logo,
            transformation: { width: 56, height: 56 },
          }),
        ],
      }),
    )
  }
  letterhead.push(
    new Paragraph({
      spacing: { before: logo ? 60 : 0 },
      children: [
        run(branding.businessName || defaultBranding.businessName, {
          bold: true,
          size: 34,
          color: 'BE185D',
        }),
      ],
    }),
  )
  for (const line of brandingLines(branding)) {
    letterhead.push(
      new Paragraph({ children: [run(line, { size: 18, color: '6B6B6B' })] }),
    )
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: REPORT_FONT, size: 21 } } } },
    sections: [
      {
        properties: {},
        children: [
          ...letterhead,
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 12, color: 'BE185D' },
            },
            spacing: { after: 200 },
            children: [],
          }),
          new Paragraph({ text: meta.title, heading: HeadingLevel.HEADING_1 }),
          ...(meta.subtitle
            ? [
                new Paragraph({
                  children: [run(meta.subtitle, { color: '666666' })],
                }),
              ]
            : []),
          ...metaLines(meta, rows.length).map(
            (line) =>
              new Paragraph({
                children: [run(line, { size: 18, color: '666666' })],
              }),
          ),
          new Paragraph({ text: '', spacing: { after: 120 } }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: header.map((text) =>
                  cell(text, { bold: true, fill: 'BE185D' }),
                ),
              }),
              ...(rows.length
                ? rows.map(
                    (row, rowIndex) =>
                      new TableRow({
                        children: header.map((_, index) =>
                          cell(row[index] ?? '', {
                            align: numericColumn[index],
                            fill: rowIndex % 2 === 1 ? 'FDF2F6' : undefined,
                          }),
                        ),
                      }),
                  )
                : [
                    new TableRow({
                      children: [
                        new TableCell({
                          columnSpan: header.length,
                          children: [
                            new Paragraph({
                              children: [
                                run(meta.emptyLabel ?? '—', {
                                  color: '999999',
                                }),
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                  ]),
            ],
          }),
          ...(meta.totals ?? []).map(
            (total) =>
              new Paragraph({
                spacing: { before: 120 },
                // One run, not label/value split across two: a reader
                // (or a raw XML substring check) must see one contiguous
                // "label<colon> value" — two <w:r> runs never merge back
                // into adjacent text once serialized.
                children: [
                  run(`${total.label}${strings.colon}${total.value}`, {
                    bold: true,
                    color: 'BE185D',
                  }),
                ],
              }),
          ),
          new Paragraph({
            spacing: { before: 420 },
            children: [
              run(
                `${strings.confidential} · ${branding.businessName || defaultBranding.businessName}`,
                { size: 16, color: '999999' },
              ),
            ],
          }),
        ],
      },
    ],
  })
  download(await Packer.toBlob(doc), filename)
}

/**
 * Branded Excel export of the same table: a letterhead block (logo + shop
 * details + period/filters) above a frozen, auto-filtered data grid, so the
 * workbook is presentable as-is instead of a bare dump.
 */
export async function exportTableExcel(
  meta: ExportMeta,
  header: string[],
  rows: Array<Array<string | number>>,
  filename: string,
) {
  const { default: ExcelJS } = await import('exceljs')
  const branding = meta.branding ?? defaultBranding
  const workbook = new ExcelJS.Workbook()
  workbook.creator = branding.businessName || defaultBranding.businessName
  workbook.created = new Date()
  const sheet = workbook.addWorksheet(meta.title.slice(0, 28) || 'Report')
  const logo = branding?.logoUrl
    ? await customLogoPng(branding.logoUrl)
    : await brandLogoPng()
  if (logo) {
    try {
      const id = workbook.addImage({ buffer: logo as never, extension: 'png' })
      sheet.addImage(id, {
        tl: { col: 0.15, row: 0.15 },
        ext: { width: 46, height: 46 },
      })
    } catch {
      /* An unsupported image pipeline must never fail the download. */
    }
  }
  sheet.getColumn(1).width = 26
  header.slice(1).forEach((_, index) => {
    sheet.getColumn(index + 2).width = 20
  })
  const titleRow = sheet.addRow([
    `        ${branding.businessName || defaultBranding.businessName}`,
  ])
  titleRow.height = 22
  titleRow.font = { bold: true, size: 15, color: { argb: 'FFBE185D' } }
  for (const line of brandingLines(branding)) {
    sheet.addRow([`        ${line}`]).font = {
      size: 10,
      color: { argb: 'FF6B6B6B' },
    }
  }
  sheet.addRow([meta.title]).font = { bold: true, size: 12 }
  if (meta.subtitle) sheet.addRow([meta.subtitle]).font = { size: 10 }
  for (const line of metaLines(meta, rows.length)) {
    sheet.addRow([line]).font = { size: 10, color: { argb: 'FF6B6B6B' } }
  }
  sheet.addRow([])
  const headerRowIndex = sheet.rowCount + 1
  const headerRow = sheet.addRow(header)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFBE185D' },
  }
  // Money columns keep a real currency number format (and stay right
  // aligned) so the workbook can be summed in Excel instead of holding
  // pre-formatted strings.
  const moneyColumns = header
    .map((label, index) => (/usd|\$|khr/i.test(label) ? index + 1 : 0))
    .filter(Boolean)
  rows.forEach((row) => {
    const added = sheet.addRow(row)
    for (const column of moneyColumns) {
      const cell = added.getCell(column)
      if (typeof cell.value === 'number') {
        cell.numFmt = /khr/i.test(header[column - 1]) ? '#,##0' : '$0.00'
      }
      cell.alignment = { horizontal: 'right' }
    }
  })
  const lastColumn = String.fromCharCode(64 + Math.min(26, header.length || 1))
  sheet.autoFilter = {
    from: `A${headerRowIndex}`,
    to: `${lastColumn}${headerRowIndex}`,
  }
  sheet.views = [{ state: 'frozen', ySplit: headerRowIndex }]
  for (const total of meta.totals ?? []) {
    const row = sheet.addRow([total.label, total.value])
    row.font = { bold: true }
  }
  const buffer = await workbook.xlsx.writeBuffer()
  download(
    new Blob([buffer as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  )
}

/** CSV of exactly the reviewed rows (letterhead lines included as comments). */
export function exportTableCsv(
  meta: ExportMeta,
  header: string[],
  rows: Array<Array<string | number>>,
  filename: string,
) {
  const branding = meta.branding ?? defaultBranding
  downloadCsv(filename, header, rows, [
    branding.businessName || defaultBranding.businessName,
    meta.title,
    ...metaLines(meta, rows.length),
  ])
}

export type LossesReport = {
  wasteCents: number
  discountsCents: number
  voidsCents: number
  refundsCents: number
  cashShortagesCents: number
  totalLostCents: number
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
/**
 * UTF-8 BOM CSV download — same convention as the dashboard/freshness CSVs
 * so Excel detects the encoding correctly.
 */
export function downloadCsv(
  filename: string,
  header: string[],
  rows: Array<Array<string | number>>,
  /** Optional letterhead lines written above the table. */
  preamble: string[] = [],
) {
  const escape = (cell: string | number) =>
    `"${String(cell).replace(/"/g, '""')}"`
  const content = [
    ...preamble.map((line) => escape(line)),
    ...[header, ...rows].map((row) => row.map(escape).join(',')),
  ]
  download(
    new Blob(['\uFEFF' + content.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    }),
    filename,
  )
}

export function ordersInRange(orders: Order[], from: string, to: string) {
  const start = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity
  const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity
  return orders.filter((order) => {
    const value = new Date(order.createdAt).getTime()
    return value >= start && value <= end
  })
}

/**
 * Every order in the range as a branded Excel workbook — the full record
 * table, on the shared letterhead, with the same columns the on-screen
 * transaction-detail table shows plus the money breakdown.
 */
export async function exportOrdersExcel(
  orders: Order[],
  from: string,
  to: string,
  options: {
    branding?: ReportBranding
    language?: ReportLanguage
    filters?: Array<{ label: string; value: string }>
    title?: string
  } = {},
) {
  const header = [
    'Order ID',
    'Date',
    'Time',
    'Source',
    'Customer / Cashier',
    'Items',
    'Details',
    'Subtotal (USD)',
    'Discount Type',
    'Discount Value',
    'Discount (USD)',
    'Payment',
    'Status',
    'Total (USD)',
  ]
  const rows = orders.map((order) => [
    order.id,
    new Date(order.createdAt).toLocaleDateString('en-CA'),
    order.time,
    order.source,
    order.customer?.name || order.cashier,
    order.items,
    order.detail.join('; '),
    Number((order.subtotal ?? order.total).toFixed(2)),
    order.discountType || '',
    order.discountValue ?? '',
    Number((order.discountAmount ?? 0).toFixed(2)),
    order.payment || '',
    order.status,
    Number(order.total.toFixed(2)),
  ])
  const revenue = orders.reduce((sum, order) => sum + order.total, 0)
  await exportTableExcel(
    {
      title: options.title ?? 'Orders',
      from,
      to,
      branding: options.branding,
      language: options.language,
      filters: options.filters,
      totals: [{ label: 'Total (USD)', value: `$${revenue.toFixed(2)}` }],
    },
    header,
    rows,
    `orders-${from || 'all'}-${to || 'all'}.xlsx`,
  )
}

/**
 * The Sales-summary report as a branded Word document: KPI block first, then
 * the top-selling products, on the shared letterhead. Language follows the
 * shop's report-language setting (en/km) instead of being hardcoded Khmer.
 */
export async function exportSummaryWord(
  orders: Order[],
  from: string,
  to: string,
  options: {
    branding?: ReportBranding
    language?: ReportLanguage
    filters?: Array<{ label: string; value: string }>
  } = {},
) {
  const language = options.language ?? 'en'
  const km = language === 'km'
  const completed = orders.filter((order) =>
    ['Paid', 'Ready', 'Completed'].includes(order.status),
  )
  const corrections = orders.filter((order) =>
    ['Refunded', 'Voided'].includes(order.status),
  )
  const revenue = [...completed, ...corrections].reduce(
    (sum, order) => sum + order.total,
    0,
  )
  const discounts = completed.reduce(
    (sum, order) => sum + (order.discountAmount || 0),
    0,
  )
  const products = new Map<string, number>()
  completed.forEach((order) =>
    order.detail.forEach((line) => {
      const [name, quantity] = line.split(' × ')
      products.set(name, (products.get(name) || 0) + (Number(quantity) || 1))
    }),
  )
  const top = [...products].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const labels = km
    ? {
        title: 'សេចក្តីសង្ខេបការលក់',
        rank: 'លេខរៀង',
        product: 'ផលិតផល',
        units: 'ឯកតា',
        revenue: 'ចំណូលសរុប',
        orders: 'ការបញ្ជាទិញដែលបានបញ្ចប់',
        discounts: 'ការបញ្ចុះតម្លៃ',
        average: 'តម្លៃមធ្យមនៃការបញ្ជាទិញ',
        subtitle: 'ផលិតផលពេញនិយម',
      }
    : {
        title: 'Sales summary',
        rank: '#',
        product: 'Product',
        units: 'Units sold',
        revenue: 'Total revenue',
        orders: 'Completed orders',
        discounts: 'Discounts applied',
        average: 'Average order value',
        subtitle: 'Top selling products',
      }
  const strings = reportStrings(language)
  await exportTableWord(
    {
      title: labels.title,
      subtitle: labels.subtitle,
      from,
      to,
      branding: options.branding,
      language,
      filters: options.filters,
      emptyLabel: strings.noProductSales,
      totals: [
        { label: labels.revenue, value: `$${revenue.toFixed(2)}` },
        { label: labels.orders, value: String(completed.length) },
        { label: labels.discounts, value: `$${discounts.toFixed(2)}` },
        {
          label: labels.average,
          value: `$${completed.length ? (revenue / completed.length).toFixed(2) : '0.00'}`,
        },
      ],
    },
    [labels.rank, labels.product, labels.units],
    top.map(([name, units], index) => [index + 1, name, units]),
    `sales-summary-${from || 'all'}-${to || 'all'}.docx`,
  )
}
