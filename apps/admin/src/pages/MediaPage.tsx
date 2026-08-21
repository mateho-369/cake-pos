import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../lib/api'
type Obj = {
  key: string
  url: string
  size: number
  lastModified: number
  status: 'in_use' | 'inactive_product' | 'orphaned'
  usedBy: string[]
}
export default function MediaPage({
  onToast,
}: {
  onToast: (s: string) => void
}) {
  const [objects, setObjects] = useState<Obj[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const load = () =>
    apiRequest<{ objects: Obj[]; totalBytes: number }>('/api/storage/media')
      .then((v) => {
        setObjects(v.objects)
        setTotal(v.totalBytes)
      })
      .catch((e) =>
        onToast(e instanceof Error ? e.message : 'Could not load media'),
      )
  useEffect(() => {
    void load()
  }, [])
  const orphaned = useMemo(
    () => objects.filter((o) => o.status === 'orphaned'),
    [objects],
  )
  const clean = async (keys: string[]) => {
    if (!keys.length) return
    if (!window.confirm(`Delete ${keys.length} selected orphaned files?`))
      return
    try {
      await apiRequest('/api/storage/media', {
        method: 'DELETE',
        body: JSON.stringify({ keys }),
      })
      setSelected([])
      onToast('Media deleted')
      void load()
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Delete failed')
    }
  }
  return (
    <div className="page-content">
      <section className="page-toolbar">
        <div>
          <h1>Storage / Media Library</h1>
          <p>
            {objects.length} objects · {(total / 1024 / 1024).toFixed(2)} MB
            used
          </p>
        </div>
        {orphaned.length > 0 && (
          <button
            className="primary-button"
            onClick={() => clean(orphaned.map((o) => o.key))}
          >
            Clean up {orphaned.length} orphaned files
          </button>
        )}
      </section>
      <div className="glass-panel" style={{ padding: 20 }}>
        <label>
          <input
            type="checkbox"
            checked={selected.length === orphaned.length && orphaned.length > 0}
            onChange={(e) =>
              setSelected(e.target.checked ? orphaned.map((o) => o.key) : [])
            }
          />{' '}
          Select orphaned
        </label>
        <div className="media-grid">
          {objects.map((o) => (
            <article key={o.key}>
              <img src={o.url} alt="" loading="lazy" />
              <strong>
                {o.status === 'in_use'
                  ? 'In use'
                  : o.status === 'inactive_product'
                    ? 'Used by inactive product'
                    : 'Orphaned'}
              </strong>
              <small>
                {(o.size / 1024).toFixed(1)} KB ·{' '}
                {new Date(o.lastModified * 1000).toLocaleDateString()}
              </small>
              {o.usedBy.map((x) => (
                <small key={x}>{x}</small>
              ))}
              {o.status === 'orphaned' && (
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
              )}{' '}
              {o.status === 'inactive_product' && (
                <button onClick={() => clean([o.key])}>Delete</button>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
