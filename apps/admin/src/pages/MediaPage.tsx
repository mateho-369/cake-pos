import { useCallback, useEffect, useMemo, useState } from 'react'
import { ImageOff, RefreshCw, Trash2 } from 'lucide-react'
import { apiRequest } from '../lib/api'
import { useTranslation } from '../lib/i18n'

type Obj = {
  key: string
  url: string
  size: number
  lastModified: number
  status: 'in_use' | 'inactive_product' | 'orphaned'
  usedBy: string[]
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export default function MediaPage({
  onToast,
}: {
  onToast: (s: string) => void
}) {
  const { t } = useTranslation()
  const [objects, setObjects] = useState<Obj[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const load = useCallback(() => {
    setLoading(true)
    return apiRequest<{ objects: Obj[]; totalBytes: number }>(
      '/api/storage/media',
    )
      .then((v) => {
        setObjects(v.objects)
        setTotal(v.totalBytes)
        // Drop selections that no longer exist (e.g. after a cleanup).
        setSelected((current) => {
          const keys = new Set(v.objects.map((o) => o.key))
          const kept = current.filter((key) => keys.has(key))
          return kept.length === current.length ? current : kept
        })
      })
      .catch((e) =>
        onToast(e instanceof Error ? e.message : t('media.loadFailed')),
      )
      .finally(() => setLoading(false))
  }, [onToast, t])
  useEffect(() => {
    void load()
  }, [load])
  const orphaned = useMemo(
    () => objects.filter((o) => o.status === 'orphaned'),
    [objects],
  )
  const clean = async (keys: string[], message: string) => {
    if (!keys.length) return
    if (!window.confirm(message)) return
    try {
      await apiRequest('/api/storage/media', {
        method: 'DELETE',
        body: JSON.stringify({ keys }),
      })
      setSelected([])
      onToast(t('media.deleted'))
      // Refresh from the server so counts, toolbar and grid all agree
      // immediately — no manual reload needed.
      await load()
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('media.deleteFailed'))
    }
  }
  const toggleAll = () =>
    setSelected(
      selected.length === orphaned.length && orphaned.length > 0
        ? []
        : orphaned.map((o) => o.key),
    )
  return (
    <div className="page-content media-page">
      <section className="page-toolbar media-toolbar">
        <div className="toolbar-context">
          <strong>{t('media.objects', { count: objects.length })}</strong>
          <span>{t('media.storageUsed', { size: formatSize(total) })}</span>
        </div>
        <div className="toolbar-actions">
          <button
            className="secondary-button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={15} /> {t('media.refresh')}
          </button>
          {orphaned.length > 0 && (
            <button
              className="primary-button"
              onClick={() =>
                void clean(
                  orphaned.map((o) => o.key),
                  t('media.confirmClean', { count: orphaned.length }),
                )
              }
            >
              <Trash2 size={15} />{' '}
              {t('media.cleanOrphaned', { count: orphaned.length })}
            </button>
          )}
        </div>
      </section>
      {orphaned.length > 0 && (
        <label className="media-select-all">
          <input
            type="checkbox"
            checked={selected.length === orphaned.length && orphaned.length > 0}
            onChange={toggleAll}
          />
          <span>{t('media.selectOrphaned')}</span>
          {selected.length > 0 && (
            <button
              className="danger-outline"
              onClick={() =>
                void clean(
                  selected,
                  t('media.confirmDelete', { count: selected.length }),
                )
              }
            >
              <Trash2 size={14} />{' '}
              {t('media.deleteSelected', { count: selected.length })}
            </button>
          )}
        </label>
      )}
      {objects.length === 0 && !loading ? (
        <div className="glass-panel empty-state media-empty">
          <ImageOff size={24} />
          <strong>{t('media.empty')}</strong>
          <span>{t('media.emptyHint')}</span>
        </div>
      ) : (
        <div className="media-grid">
          {objects.map((o) => {
            const orphan = o.status === 'orphaned'
            const deletable = orphan || o.status === 'inactive_product'
            return (
              <article
                key={o.key}
                className={`glass-panel media-card ${o.status}`}
              >
                <div className="media-card-thumb">
                  <img src={o.url} alt="" loading="lazy" />
                  <span className={`media-status ${o.status}`}>
                    <i />
                    {o.status === 'in_use'
                      ? t('media.inUse')
                      : o.status === 'inactive_product'
                        ? t('media.inactiveProduct')
                        : t('media.orphaned')}
                  </span>
                </div>
                <div className="media-card-body">
                  <div className="media-meta">
                    <div>
                      <span>{t('media.size')}</span>
                      <strong>{formatSize(o.size)}</strong>
                    </div>
                    <div>
                      <span>{t('media.modified')}</span>
                      <strong>
                        {new Date(o.lastModified * 1000).toLocaleDateString()}
                      </strong>
                    </div>
                  </div>
                  <div className="media-refs">
                    <span>{t('media.referencedBy')}</span>
                    {o.usedBy.length > 0 ? (
                      <ul>
                        {o.usedBy.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>{t('media.noReferences')}</p>
                    )}
                  </div>
                  {deletable && (
                    <div className="media-card-actions">
                      {orphan && (
                        <label className="media-check">
                          <input
                            type="checkbox"
                            checked={selected.includes(o.key)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, o.key]
                                  : selected.filter((k) => k !== o.key),
                              )
                            }
                          />
                          <span>{t('common.select')}</span>
                        </label>
                      )}
                      <button
                        className="danger-outline"
                        onClick={() =>
                          void clean([o.key], t('media.confirmDeleteOne'))
                        }
                      >
                        <Trash2 size={14} /> {t('media.delete')}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
