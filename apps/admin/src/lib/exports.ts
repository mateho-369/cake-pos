import type { Order } from '../data'

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
) {
  const escape = (cell: string | number) =>
    `"${String(cell).replace(/"/g, '""')}"`
  const content = [header, ...rows].map((row) => row.map(escape).join(','))
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

export async function exportOrdersExcel(
  orders: Order[],
  from: string,
  to: string,
) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'G-Cake POS'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('Orders', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  sheet.columns = [
    { header: 'Order ID', key: 'id', width: 16 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Time', key: 'time', width: 13 },
    { header: 'Source', key: 'source', width: 12 },
    { header: 'Customer / Cashier', key: 'person', width: 25 },
    { header: 'Items', key: 'items', width: 10 },
    { header: 'Details', key: 'details', width: 45 },
    { header: 'Subtotal (USD)', key: 'subtotal', width: 16 },
    { header: 'Discount Type', key: 'discountType', width: 16 },
    { header: 'Discount Value', key: 'discountValue', width: 16 },
    { header: 'Discount (USD)', key: 'discountAmount', width: 16 },
    { header: 'Payment', key: 'payment', width: 12 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Total (USD)', key: 'total', width: 15 },
  ]
  orders.forEach((order) =>
    sheet.addRow({
      id: order.id,
      date: new Date(order.createdAt).toLocaleDateString('en-CA'),
      time: order.time,
      source: order.source,
      person: order.customer?.name || order.cashier,
      items: order.items,
      details: order.detail.join('; '),
      subtotal: order.subtotal ?? order.total,
      discountType: order.discountType || '',
      discountValue: order.discountValue ?? '',
      discountAmount: order.discountAmount ?? 0,
      payment: order.payment || '',
      status: order.status,
      total: order.total,
    }),
  )
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFBE185D' },
  }
  sheet.getColumn('subtotal').numFmt = '$0.00'
  sheet.getColumn('discountAmount').numFmt = '$0.00'
  sheet.getColumn('total').numFmt = '$0.00'
  sheet.autoFilter = { from: 'A1', to: 'N1' }
  const buffer = await workbook.xlsx.writeBuffer()
  download(
    new Blob([buffer as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `orders-${from || 'all'}-${to || 'all'}.xlsx`,
  )
}

export async function exportSummaryWord(
  orders: Order[],
  from: string,
  to: string,
) {
  const {
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import('docx')
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
  const km = {
    shop: 'ហាងនំអាតេលៀ',
    title: 'សេចក្តីសង្ខេបការលក់',
    period: (start: string, end: string) =>
      `រយៈពេលរាយការណ៍៖ ${start} ដល់ ${end}`,
    allDates: 'រាល់កាលបរិច្ឆេទ',
    present: 'បច្ចុប្បន្ន',
    totalRevenue: (value: string) => `ចំណូលសរុប៖ $${value}`,
    completedOrders: (value: number) => `ការបញ្ជាទិញដែលបានបញ្ចប់៖ ${value}`,
    discounts: (value: string) => `ការបញ្ចុះតម្លៃដែលបានអនុវត្ត៖ $${value}`,
    average: (value: string) => `តម្លៃមធ្យមនៃការបញ្ជាទិញ៖ $${value}`,
    noSales: 'គ្មានការលក់ផលិតផលដែលបានបញ្ចប់ក្នុងអំឡុងពេលនេះទេ។',
    topProducts: 'ផលិតផលពេញនិយម',
    rank: 'លេខរៀង',
    product: 'ផលិតផល',
    units: 'ឯកតា',
    generated: (value: string) => `បង្កើតនៅ ${value}`,
  }
  const khmerFont = {
    ascii: 'Kantumruy Pro',
    hAnsi: 'Kantumruy Pro',
    eastAsia: 'Kantumruy Pro',
  }
  const products = new Map<string, number>()
  completed.forEach((order) =>
    order.detail.forEach((line) => {
      const [name, quantity] = line.split(' × ')
      products.set(name, (products.get(name) || 0) + (Number(quantity) || 1))
    }),
  )
  const top = [...products].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const rows = top.length
    ? top.map(
        ([name, units], index) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(String(index + 1))] }),
              new TableCell({ children: [new Paragraph(name)] }),
              new TableCell({ children: [new Paragraph(String(units))] }),
            ],
          }),
      )
    : [
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 3,
              children: [new Paragraph(km.noSales)],
            }),
          ],
        }),
      ]
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: khmerFont, size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: km.shop,
            heading: HeadingLevel.TITLE,
          }),
          new Paragraph({
            text: km.title,
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: km.period(from || km.allDates, to || km.present),
                font: khmerFont,
                color: '666666',
              }),
            ],
          }),
          new Paragraph({
            text: km.totalRevenue(revenue.toFixed(2)),
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: km.completedOrders(completed.length),
          }),
          new Paragraph({
            text: km.discounts(discounts.toFixed(2)),
          }),
          new Paragraph({
            text: km.average(
              completed.length
                ? (revenue / completed.length).toFixed(2)
                : '0.00',
            ),
          }),
          new Paragraph({
            text: km.topProducts,
            heading: HeadingLevel.HEADING_2,
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [km.rank, km.product, km.units].map(
                  (text) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({ text, bold: true, font: khmerFont }),
                          ],
                        }),
                      ],
                    }),
                ),
              }),
              ...rows,
            ],
          }),
          new Paragraph({
            text: km.generated(new Date().toLocaleString()),
            spacing: { before: 500 },
          }),
        ],
      },
    ],
  })
  download(
    await Packer.toBlob(doc),
    `sales-summary-${from || 'all'}-${to || 'all'}.docx`,
  )
}
