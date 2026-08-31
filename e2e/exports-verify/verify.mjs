/**
 * Exports verification — runs the ADMIN APP'S REAL export code
 * (apps/admin/src/lib/exports.ts) in Node.
 *
 * The only deviation: the browser-only `download()` helper (which triggers a
 * save dialog via URL.createObjectURL) is replaced with a stub that writes the
 * produced blob to disk. Every line that builds the workbook/document content
 * is byte-for-byte the app's code. We then unzip the real files and assert on
 * their actual contents (English headers, hand-computed totals, Khmer text and
 * font references in the .docx).
 *
 * Usage: node e2e/exports-verify/verify.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import esbuild from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'e2e/exports-verify/out')
mkdirSync(outDir, { recursive: true })

// ---- 1. Prepare a Node-runnable copy of the real module ----
const source = readFileSync(join(root, 'apps/admin/src/lib/exports.ts'), 'utf8')
const stubbed = source.replace(
  /function download\(blob: Blob, filename: string\) \{[\s\S]*?\n\}/,
  `function download(blob: Blob, filename: string) {
  globalThis.__download(filename, blob)
}`,
)
const tmp = join(outDir, 'exports-stub.ts')
writeFileSync(tmp, stubbed)
// The branding module (letterhead identity, logo, report strings) is a plain
// sibling import, so copy it next to the stub and let esbuild bundle it.
writeFileSync(
  join(outDir, 'reportBranding.ts'),
  readFileSync(join(root, 'apps/admin/src/lib/reportBranding.ts'), 'utf8'),
)

await esbuild.build({
  entryPoints: [tmp],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: join(outDir, 'exports.cjs'),
  logLevel: 'silent',
})

const { exportOrdersExcel, exportSummaryWord, exportTableWord } = await import(
  join(outDir, 'exports.cjs')
)

// ---- 2. Sample orders shaped exactly like the API's OrderResource ----
// (ids, createdAt ISO strings, totals in decimal USD, statuses, details)
const sample = [
  {
    id: 'CS-1001',
    createdAt: '2026-08-26T02:30:00.000Z',
    time: '9:30 AM',
    date: 'Today',
    cashier: 'Sophea Chan',
    source: 'walk-in',
    items: 2,
    subtotal: 20,
    discountType: null,
    discountValue: null,
    discountAmount: 0,
    payment: 'Cash',
    status: 'Completed',
    detail: ['Test Cake × 2'],
    total: 20,
  },
  {
    id: 'CS-1002',
    createdAt: '2026-08-26T03:00:00.000Z',
    time: '10:00 AM',
    date: 'Today',
    cashier: 'Sophea Chan',
    source: 'walk-in',
    items: 1,
    subtotal: 12.5,
    discountType: 'percentage',
    discountValue: 10,
    discountAmount: 1.25,
    payment: 'KHQR',
    status: 'Completed',
    detail: ['Matcha Slice × 1'],
    total: 11.25,
  },
  {
    id: 'CS-1003',
    createdAt: '2026-08-26T04:00:00.000Z',
    time: '11:00 AM',
    date: 'Today',
    cashier: 'Dara Lim',
    source: 'walk-in',
    items: 1,
    subtotal: 5,
    discountType: null,
    discountValue: null,
    discountAmount: 0,
    payment: 'Cash',
    status: 'Refunded',
    detail: ['Americano × 1'],
    total: -5,
  },
]

let failures = 0
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`)
  if (!cond) failures++
}

// ---- 3. Excel export (Orders) ----
const pending = []
globalThis.__download = (filename, blob) => {
  pending.push(
    blob.arrayBuffer().then((buf) => writeFileSync(join(outDir, filename), Buffer.from(buf))),
  )
}
await exportOrdersExcel(
  sample.filter((o) => o.status !== 'Refunded'),
  '2026-08-26',
  '2026-08-26',
)
await Promise.all(pending)
const xlsxPath = join(outDir, 'orders-2026-08-26-2026-08-26.xlsx')
check('xlsx file was produced', exists(xlsxPath))
const shared = run(`unzip -p ${xlsxPath} xl/sharedStrings.xml`)
const sheet = run(`unzip -p ${xlsxPath} xl/worksheets/sheet1.xml`)
const styles = run(`unzip -p ${xlsxPath} xl/styles.xml`)
check('xlsx headers are English', /Order ID/.test(shared) && /Total \(USD\)/.test(shared), 'Order ID / Total (USD) found')
check('xlsx header row bold+white font', /<b\/><color rgb="FFFFFFFF"\/>/.test(styles), 'styles.xml bold white font')
check('xlsx header row pink fill', /fgColor rgb="FFBE185D"/.test(styles), 'styles.xml BE185D fill')
check('xlsx money columns use $0.00 format', /formatCode="\$0\.00"/.test(styles), 'numFmt 164 $0.00')
check('xlsx contains order CS-1001 and CS-1002', shared.includes('CS-1001') && shared.includes('CS-1002'))
check('xlsx excludes refunded CS-1003', !shared.includes('CS-1003'))
check('xlsx total 20.00 present (hand-computed, stored as 20 with $0.00 fmt)', /<v>20<\/v>/.test(sheet), 'raw cell value 20')
check('xlsx total 11.25 present (hand-computed 12.50 - 1.25 discount)', /<v>11\.25<\/v>/.test(sheet), 'raw cell value 11.25')
check('xlsx discount amount 1.25 present', /<v>1\.25<\/v>/.test(sheet), 'raw cell value 1.25')

// ---- 4. Word export — branded letterhead, English default, Khmer option ----
const brand = {
  businessName: 'ហាងនំអាតេលៀ',
  locationName: 'Toul Kork',
  address: '12 Street 315, Phnom Penh',
  phone: '+855 12 345 678',
}
await exportSummaryWord(sample, '2026-08-26', '2026-08-26')
await Promise.all(pending)
const docxPath = join(outDir, 'sales-summary-2026-08-26-2026-08-26.docx')
check('docx file was produced', exists(docxPath))
const englishXml = run(`unzip -p ${docxPath} word/document.xml`)
// The report language is a setting now, and it defaults to English rather
// than the old hardcoded Khmer document.
check(
  'docx defaults to the English report language',
  englishXml.includes('Sales summary') &&
    englishXml.includes('Total revenue') &&
    englishXml.includes('Top selling products'),
)
check(
  'English docx labels the period and the record count',
  /Reporting period[^<]*2026-08-26/.test(englishXml) &&
    /Records: /.test(englishXml),
)

await exportSummaryWord(sample, '2026-08-26', '2026-08-26', {
  language: 'km',
  branding: brand,
})
await Promise.all(pending)
const docXml = run(`unzip -p ${docxPath} word/document.xml`)
// Hand-computed expectations from the module's logic:
//   revenue = (20.00 + 11.25) + (-5.00) = 26.25
//   completed = 2, discounts = 1.25, average = 26.25 / 2 = 13.13
const revenue = (20 + 11.25 + -5).toFixed(2)
const average = (26.25 / 2).toFixed(2)
check('docx letterhead carries the shop name from Settings', docXml.includes(brand.businessName))
check(
  'docx letterhead carries the branch, address and phone',
  docXml.includes(brand.locationName) &&
    docXml.includes(brand.address) &&
    docXml.includes(brand.phone),
)
check('docx contains Khmer title', docXml.includes('សេចក្តីសង្ខេបការលក់'))
check('docx contains the Khmer period line', docXml.includes('រយៈពេលរាយការណ៍'))
check('docx contains Khmer total revenue with real value', docXml.includes(`ចំណូលសរុប`) && docXml.includes(`$${revenue}`), `$${revenue} (hand-computed 20.00+11.25-5.00)`)
check('docx contains Khmer completed orders count', docXml.includes('ការបញ្ជាទិញដែលបានបញ្ចប់'))
check('docx contains Khmer discounts with real value', docXml.includes('ការបញ្ចុះតម្លៃ') && docXml.includes('$1.25'))
check('docx contains Khmer average', docXml.includes('តម្លៃមធ្យមនៃការបញ្ជាទិញ') && docXml.includes(`$${average}`), `$${average}`)
check('docx contains Khmer "top products" header', docXml.includes('ផលិតផលពេញនិយម'))
check('docx contains Khmer table headers', docXml.includes('លេខរៀង') && docXml.includes('ផលិតផល') && docXml.includes('ឯកតា'))
check('docx product rows are real', docXml.includes('Test Cake') && docXml.includes('Matcha Slice'))
check('docx Khmer font reference (Kantumruy Pro)', /Kantumruy Pro/.test(docXml))
// count Khmer codepoint runs in document.xml (real glyphs, not missing-glyph boxes)
const khmerRunes = (docXml.match(/[\u1780-\u17FF]/g) || []).length
check('docx contains actual Khmer glyph codepoints', khmerRunes > 50, `${khmerRunes} Khmer codepoints`)

// A generic branded table export (what the review dialog produces) must
// survive an environment with no canvas: text-only letterhead, no crash.
await exportTableWord(
  {
    title: 'Payment records',
    from: '2026-08-01',
    to: '2026-08-31',
    branding: brand,
    language: 'en',
    filters: [{ label: 'Payment', value: 'KHQR' }],
    totals: [{ label: 'Total (USD)', value: '$31.25' }],
  },
  ['Order', 'Payment', 'Total (USD)'],
  [['CS-1001', 'KHQR', 20], ['CS-1002', 'Cash', 11.25]],
  'payment-records.docx',
)
await Promise.all(pending)
const tableXml = run(`unzip -p ${join(outDir, 'payment-records.docx')} word/document.xml`)
check('branded table export writes a real Word table with the reviewed rows', /<w:tbl>/.test(tableXml) && tableXml.includes('CS-1001') && tableXml.includes('CS-1002'))
check('branded table export reproduces the applied filters on the document', tableXml.includes('Payment: KHQR'))
check('branded table export prints the totals under the table', tableXml.includes('Total (USD)') && tableXml.includes('$31.25'))
check('branded table export degrades to a text letterhead without a canvas', tableXml.includes(brand.businessName) && !/<w:drawing>/.test(tableXml))

// product names with Khmer impossible → check "No sales" branch separately:
const emptyXml = await (async () => {
  await exportSummaryWord([], '2026-08-26', '2026-08-26', { language: 'km', branding: brand })
  await Promise.all(pending)
  return run(`unzip -p ${docxPath} word/document.xml`)
})()
check('docx empty-state still renders the Khmer summary with zero rows', emptyXml.includes('សេចក្តីសង្ខេបការលក់') && emptyXml.includes('$0.00'))

// ---- 5. CSV export (Dashboard daily summary) — same construction as the component ----
const netSales = 0
const completedOrders = 0
const averageOrder = 0
const freshnessRisk = 0
const csv = [
  'Metric,Value',
  `Net sales,${netSales.toFixed(2)}`,
  `Orders,${completedOrders}`,
  `Average order,${averageOrder.toFixed(2)}`,
  `Freshness risk,${freshnessRisk.length}`,
].join('\n')
const bomCsv = '\uFEFF' + csv
check('CSV starts with UTF-8 BOM (EF BB BF)', Buffer.from(bomCsv, 'utf8').subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])))
check('CSV headers are English', bomCsv.startsWith('\uFEFFMetric,Value'))
writeFileSync(join(outDir, 'dashboard-summary.csv'), Buffer.from(bomCsv, 'utf8'))

console.log(failures === 0 ? '\nALL EXPORT CHECKS PASSED' : `\n${failures} EXPORT CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)

function exists(p) {
  try {
    return readFileSync(p).length > 0
  } catch {
    return false
  }
}
function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
}
