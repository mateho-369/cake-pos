import { useEffect, useState } from 'react'
import { api, type Category } from '@bloom/shared'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState('')

  const reload = () => api.categories.list().then(setCategories)

  useEffect(() => {
    void reload()
  }, [])

  return (
    <div className="bloom-in mx-auto max-w-3xl pb-10">
      <h1 className="text-3xl font-semibold tracking-tight">Categories</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
        Pills on the sale terminal follow this order.
      </p>
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) {
            void api.categories.create(name).then(() => {
              setName('')
              return reload()
            })
          }
        }}
      >
        <input className="field" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-pink shrink-0" type="submit">
          Add
        </button>
      </form>
      <ul className="mt-5 space-y-2">
        {categories.map((c) => (
          <li key={c.id} className="glass flex items-center justify-between px-4 py-3">
            <span className="font-medium">{c.name}</span>
            <button
              type="button"
              className="text-sm"
              style={{ color: '#BE123C' }}
              onClick={() => void api.categories.remove(c.id).then(reload)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
