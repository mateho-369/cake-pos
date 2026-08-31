import { useState } from 'react'
import { Download, FileSpreadsheet, FileText, Table2, X } from 'lucide-react'
import { useTranslation } from '../lib/i18n'
import {
  exportTableCsv,
  exportTableExcel,
  exportTableWord,
  type ExportMeta,
} from '../lib/exports'
import type { ReportLanguage } from '../lib/reportBranding'

export type ExportRequest = {
  meta: ExportMeta
  header: string[]
  rows: Array<Array<string | number>>
  /** File name without extension. */
  filenameBase: string
  /** Format the dialog opens on (the button the admin pressed). */
  defaultFormat?: 'word' | 'excel' | 'csv'
}

const PREVIEW_ROWS = 8

/**
 * Review-before-download. Nothing is generated when the admin clicks an
 * export button: this dialog first shows exactly what the file will
 * contain — report name, period, the filters that were applied, the record
 * count and the first rows of the real data — and only the explicit
 * Download press produces the .docx/.xlsx/.csv. The format and the report
 * language can still be changed here, so a wrong-format download does not
 * mean starting over.
 */
export default function ExportPreviewModal({
  request,
  language,
  onLanguage,
  onClose,
  onDone,
}: {
  request: ExportRequest
  language: ReportLanguage
  onLanguage: (language: ReportLanguage) => void
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<'word' | 'excel' | 'csv'>(
    request.defaultFormat ?? 'word',
  )
  const [busy, setBusy] = useState(false)
  const { meta, header, rows, filenameBase } = request
  const preview = rows.slice(0, PREVIEW_ROWS)
  const formats = [
    { id: 'word' as const, label: 'Word', icon: FileText },
    { id: 'excel' as const, label: 'Excel', icon: FileSpreadsheet },
    { id: 'csv' as const, label: 'CSV', icon: Table2 },
  ]
  const confirm = () => {
    setBusy(true)
    const fullMeta = { ...meta, language }
    const run = () => {
      if (format === 'excel')
        return exportTableExcel(fullMeta, header, rows, `${filenameBase}.xlsx`)
      if (format === 'csv')
        return exportTableCsv(fullMeta, header, rows, `${filenameBase}.csv`)
      return exportTableWord(fullMeta, header, rows, `${filenameBase}.docx`)
    }
    Promise.resolve(run())
      .then(() =>
        onDone(
          t('reports.exportDone', {
            name: meta.title,
            count: rows.length,
          }),
        ),
      )
      .catch((error) =>
        onDone(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => {
        setBusy(false)
        onClose()
      })
  }
  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <button
        className="modal-backdrop"
        onClick={onClose}
        aria-label={t('modal.closeDialog')}
      />
      <section className="modal-card modal-large export-preview-card">
        <header className="modal-header">
          <div>
            <span>{t('reports.reviewBeforeDownload')}</span>
            <h2>{meta.title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t('modal.close')}
          >
            <X size={19} />
          </button>
        </header>
        <div className="modal-form export-preview-body">
          <p className="export-preview-lead">{t('reports.reviewLead')}</p>
          <dl className="export-preview-meta">
            <div>
              <dt>{t('reports.periodLabel')}</dt>
              <dd>
                {meta.from || '—'} → {meta.to || '—'}
              </dd>
            </div>
            <div>
              <dt>{t('reports.recordsLabel')}</dt>
              <dd>
                <strong>{rows.length}</strong>
              </dd>
            </div>
            <div>
              <dt>{t('reports.filtersLabel')}</dt>
              <dd>
                {meta.filters?.length
                  ? meta.filters
                      .map((filter) => `${filter.label}: ${filter.value}`)
                      .join(' · ')
                  : t('reports.noFiltersApplied')}
              </dd>
            </div>
          </dl>
          <div className="export-preview-choices">
            <div className="export-preview-formats">
              {formats.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={format === item.id ? 'active' : ''}
                    onClick={() => setFormat(item.id)}
                  >
                    <Icon size={15} /> {item.label}
                  </button>
                )
              })}
            </div>
            <div className="export-preview-language">
              <span>{t('reports.reportLanguage')}</span>
              {(['en', 'km'] as ReportLanguage[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  className={language === code ? 'active' : ''}
                  onClick={() => onLanguage(code)}
                >
                  {code === 'en' ? 'English' : 'ខ្មែរ'}
                </button>
              ))}
            </div>
          </div>
          <div className="table-responsive export-preview-table-wrap">
            <table className="report-detail-table export-preview-table">
              <thead>
                <tr>
                  {header.map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr key={index}>
                    {header.map((_, column) => (
                      <td key={column}>{row[column] ?? ''}</td>
                    ))}
                  </tr>
                ))}
                {!preview.length && (
                  <tr>
                    <td colSpan={header.length}>
                      {t('reports.noTransactions')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {rows.length > preview.length && (
            <small className="export-preview-more">
              {t('reports.previewMore', {
                shown: preview.length,
                total: rows.length,
              })}
            </small>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={confirm}
            >
              <Download size={15} /> {t('reports.confirmDownload')}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
