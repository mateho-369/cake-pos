import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api, freshness, freshnessBadge, freshnessLabel, money, type Category, type Product, type Settings } from '@bloom/shared'
import AddProductSheet from '@bloom/shared/components/AddProductSheet'

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')

  const reload = async () => {
    const [p, c, s] = await Promise.all([api.products.list(), api.categories.list(), api.settings.get()])
    setProducts(p)
    setCategories(c)
    setSettings(s)
  }

  useEffect(() => {
    void reload()
  }, [])

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '—'

  const startEdit = (p: Product) => {
    setEditing(p)
    setName(p.name)
    setPrice((p.price / 100).toFixed(2))
  }

  const saveEdit = async () => {
    if (!editing) return
    await api.products.update(editing.id, { name, price: Math.round(Number(price) * 100) })
    setEditing(null)
    await reload()
  }

  return (
    <div className="bloom-in mx-auto max-w-6xl pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
            Fresh batches every 2–3 days. Photograph, name, price, done.
          </p>
        </div>
        <button type="button" className="btn-pink btn-pink-ring" onClick={() => setOpen(true)}>
          <Plus size={16} /> Add cake
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {products
          .filter((p) => p.isActive)
          .map((p) => {
            const kind = freshness(p)
            return (
              <article key={p.id} className="product-card !cursor-default">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                  <span className={`${freshnessBadge(kind)} absolute left-2.5 top-2.5`}>{freshnessLabel(p)}</span>
                </div>
                <div className="px-3 pb-3 pt-2.5">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="text-[0.7rem]" style={{ color: 'var(--ink-3)' }}>
                    {catName(p.categoryId)} · {p.stockQty} in case
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="price">{money(p.price)}</p>
                    <span className="flex gap-1">
                      <button type="button" className="grid h-8 w-8 place-items-center rounded-full glass-soft" onClick={() => startEdit(p)}>
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="grid h-8 w-8 place-items-center rounded-full glass-soft"
                        onClick={() => void api.products.remove(p.id).then(reload)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  </div>
                </div>
              </article>
            )
          })}
      </div>

      {settings && (
        <AddProductSheet
          open={open}
          onClose={() => setOpen(false)}
          categories={categories}
          bestBeforeDays={settings.bestBeforeDays}
          onSave={async (input) => {
            await api.products.create(input)
            await reload()
          }}
        />
      )}

      {editing && (
        <div className="fixed inset-0 z-40 grid place-items-center px-4" style={{ background: 'rgba(59,10,31,0.28)' }} onClick={() => setEditing(null)}>
          <div className="sheet w-full max-w-sm rounded-[24px] p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Edit cake</h2>
            <label className="field-label mt-4">Name</label>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="field-label mt-3">Price</label>
            <input className="field tabular" value={price} onChange={(e) => setPrice(e.target.value)} />
            <button type="button" className="btn-pink mt-4 w-full" onClick={() => void saveEdit()}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
