import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react'
import Modal from './Modal'
import type { Category, Product } from '../data'
import { apiRequest } from '../lib/api'

type Row = {
  name: string
  category: string
  price: number
  stock: number
  madeAt: string
  bestBefore: string
}
type Preview = { row: number; value: Row; errors: string[] }
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function excelDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number')
    return new Date(Date.UTC(1899, 11, 30 + value)).toISOString().slice(0, 10)
  return String(value || '').trim()
}

export default function ProductImportModal({
  open,
  onClose,
  categories,
  onImported,
  onToast,
}: {
  open: boolean
  onClose: () => void
  categories: Category[]
  onImported: () => Promise<void>
  onToast: (message: string) => void
}) {
  const [preview, setPreview] = useState<Preview[]>([])
  const [filename, setFilename] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{
    created: number
    skipped: Array<{ row: number; errors: string[] }>
  } | null>(null)
  const known = new Set(categories.map((item) => item.name))
  const downloadTemplate = async () => {
    const { default: ExcelJS } = await import('exceljs')
    const book = new ExcelJS.Workbook()
    const sheet = book.addWorksheet('Products')
    sheet.columns = [
      { header: 'name', key: 'name', width: 28 },
      { header: 'category', key: 'category', width: 22 },
      { header: 'price', key: 'price', width: 12 },
      { header: 'stock', key: 'stock', width: 12 },
      { header: 'madeAt', key: 'madeAt', width: 16 },
      { header: 'bestBefore', key: 'bestBefore', width: 16 },
    ]
    sheet.addRow({
      name: 'Vanilla Celebration',
      category: categories[0]?.name || 'Signature',
      price: 32,
      stock: 4,
      madeAt: new Date().toISOString().slice(0, 10),
      bestBefore: new Date(Date.now() + 3 * 86400000)
        .toISOString()
        .slice(0, 10),
    })
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFBE185D' },
    }
    const data = await book.xlsx.writeBuffer()
    saveBlob(
      new Blob([data as BlobPart]),
      'cake-pos-product-import-template.xlsx',
    )
  }
  const read = async (file: File) => {
    setFilename(file.name)
    setResult(null)
    const { default: ExcelJS } = await import('exceljs')
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await file.arrayBuffer())
    const sheet = book.worksheets[0]
    if (!sheet) throw new Error('The workbook has no worksheet')
    const headers = new Map<string, number>()
    sheet
      .getRow(1)
      .eachCell((cell, col) =>
        headers.set(String(cell.value || '').trim(), col),
      )
    const expected = [
      'name',
      'category',
      'price',
      'stock',
      'madeAt',
      'bestBefore',
    ]
    const missing = expected.filter((key) => !headers.has(key))
    if (missing.length)
      throw new Error(`Missing columns: ${missing.join(', ')}`)
    const rows: Preview[] = []
    sheet.eachRow((row, index) => {
      if (index === 1) return
      const get = (key: string) => row.getCell(headers.get(key)!).value
      if (expected.every((key) => String(get(key) || '').trim() === '')) return
      const value = {
        name: String(get('name') || '').trim(),
        category: String(get('category') || '').trim(),
        price: Number(get('price')),
        stock: Number(get('stock')),
        madeAt: excelDate(get('madeAt')),
        bestBefore: excelDate(get('bestBefore')),
      }
      const errors: string[] = []
      if (!value.name) errors.push('Missing name')
      if (!value.category) errors.push('Missing category')
      else if (!known.has(value.category))
        errors.push(`Unknown category “${value.category}”`)
      if (!Number.isFinite(value.price) || value.price < 0)
        errors.push('Invalid price')
      if (!Number.isInteger(value.stock) || value.stock < 0)
        errors.push('Invalid stock')
      if (!value.madeAt) errors.push('Missing madeAt')
      if (!value.bestBefore) errors.push('Missing bestBefore')
      rows.push({ row: index, value, errors })
    })
    setPreview(rows)
  }
  const confirm = async () => {
    setBusy(true)
    try {
      const rows = preview.map((item) => ({ ...item.value, _row: item.row }))
      const result = await apiRequest<{
        created: Product[]
        skipped: Array<{ row: number; errors: string[] }>
      }>('/api/products/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      })
      await onImported()
      setResult({ created: result.created.length, skipped: result.skipped })
      onToast(
        `${result.created.length} products created${result.skipped.length ? `; ${result.skipped.length} rows skipped` : ''}`,
      )
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }
  const valid = preview.filter((item) => !item.errors.length)
  const invalid = preview.filter((item) => item.errors.length)
  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="EXCEL IMPORT"
      title="Import products"
      size="large"
    >
      <div className="product-import">
        <div className="import-guide">
          <FileSpreadsheet size={22} />
          <div>
            <strong>Use the exact product template</strong>
            <span>
              Download it, complete one product per row, then upload it here.
            </span>
          </div>
          <button
            className="secondary-button"
            onClick={() => void downloadTemplate()}
          >
            <Download size={16} /> Download Template
          </button>
        </div>
        <label className="import-drop">
          <input
            type="file"
            accept=".xlsx"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void read(file).catch((error) => onToast(error.message))
            }}
          />
          <Upload size={25} />
          <strong>{filename || 'Choose an Excel workbook'}</strong>
          <span>.xlsx files only · nothing is created until confirmation</span>
        </label>
        {preview.length > 0 && (
          <>
            <div className="import-counts">
              <span className="valid">
                <CheckCircle2 size={16} />
                <strong>{valid.length}</strong> ready to create
              </span>
              <span className={invalid.length ? 'invalid' : ''}>
                <AlertTriangle size={16} />
                <strong>{invalid.length}</strong> rows with errors
              </span>
            </div>
            <div className="import-preview-table">
              <div className="import-row head">
                <span>Row</span>
                <span>Name</span>
                <span>Category</span>
                <span>Price</span>
                <span>Stock</span>
                <span>Validation</span>
              </div>
              {preview.map((item) => (
                <div
                  className={`import-row ${item.errors.length ? 'error' : ''}`}
                  key={item.row}
                >
                  <strong>{item.row}</strong>
                  <span>{item.value.name || '—'}</span>
                  <span>{item.value.category || '—'}</span>
                  <span>
                    {Number.isFinite(item.value.price)
                      ? `$${item.value.price}`
                      : '—'}
                  </span>
                  <span>
                    {Number.isFinite(item.value.stock) ? item.value.stock : '—'}
                  </span>
                  <span>
                    {item.errors.length ? item.errors.join(' · ') : 'Ready'}
                  </span>
                </div>
              ))}
            </div>
            <p className="import-confirm-note">
              Only the {valid.length} valid row{valid.length === 1 ? '' : 's'}{' '}
              will be created. Invalid rows will be skipped and reported.
            </p>
          </>
        )}
        {result && (
          <div className="import-result">
            <strong>{result.created} products created.</strong>
            {result.skipped.length > 0 && (
              <ul>
                {result.skipped.map((item) => (
                  <li key={item.row}>
                    Row {item.row}: {item.errors.join(', ')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="modal-actions">
          <button
            className="secondary-button"
            onClick={() => {
              onClose()
              setResult(null)
              setPreview([])
              setFilename('')
            }}
          >
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result && (
            <button
              className="primary-button"
              disabled={!valid.length || busy}
              onClick={() => void confirm()}
            >
              <Upload size={16} />
              {busy ? 'Importing…' : `Confirm ${valid.length} products`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
