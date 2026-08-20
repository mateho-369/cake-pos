import { useState } from 'react'
import { useStore } from '../../contexts/StoreContext'
import { db } from '../../lib/db'

export default function CategoriesPage() {
  const { state } = useStore()
  const [name, setName] = useState('')

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
            db.createCategory(name)
            setName('')
          }
        }}
      >
        <input className="field" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-pink shrink-0" type="submit">
          Add
        </button>
      </form>
      <ul className="mt-5 space-y-2">
        {state.categories
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((c) => (
            <li key={c.id} className="glass flex items-center justify-between px-4 py-3">
              <span className="font-medium">{c.name}</span>
              <button type="button" className="text-sm" style={{ color: '#BE123C' }} onClick={() => db.removeCategory(c.id)}>
                Remove
              </button>
            </li>
          ))}
      </ul>
    </div>
  )
}
