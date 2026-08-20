import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, X } from 'lucide-react'
import type { Category } from '../types'
import { db } from '../lib/db'
import { parseMoney } from '../lib/money'

export default function AddProductSheet({
  open,
  onClose,
  categories,
}: {
  open: boolean
  onClose: () => void
  categories: Category[]
}) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [imageUrl, setImageUrl] = useState('')
  const [madeToday, setMadeToday] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setName('')
    setPrice('')
    setCategoryId(categories[0]?.id ?? '')
    setImageUrl('')
    setMadeToday(true)
    setError('')
  }

  const onFile = (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      setError('Please choose a photo smaller than 4 MB.')
      return
    }
    const reader = new FileReader()
    const controllerTimeout = window.setTimeout(() => reader.abort(), 45_000)
    reader.onload = () => {
      window.clearTimeout(controllerTimeout)
      setImageUrl(String(reader.result || ''))
    }
    reader.onerror = () => {
      window.clearTimeout(controllerTimeout)
      setError('The photo could not be read.')
    }
    reader.readAsDataURL(file)
  }

  const save = () => {
    setError('')
    if (!imageUrl) return setError('Add a photo — cakes change every batch.')
    if (name.trim().length < 2) return setError('Give this cake a name.')
    const cents = parseMoney(price)
    if (cents < 50) return setError('Enter a price.')
    if (!categoryId) return setError('Pick a category.')
    setBusy(true)
    try {
      db.createProduct({
        name,
        price: cents,
        categoryId,
        imageUrl,
        madeToday,
        stockQty: 1,
      })
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center sm:items-center"
          style={{ background: 'rgba(59,10,31,0.28)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="sheet w-full max-w-lg rounded-t-[28px] p-5 sm:rounded-[28px] sm:p-6"
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 40 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--pink-deep)' }}>
                  Quick add
                </p>
                <h2 className="text-xl font-semibold tracking-tight">New cake</h2>
              </div>
              <button type="button" className="btn-glass h-10 w-10 !p-0" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative mb-4 flex h-44 w-full items-center justify-center overflow-hidden rounded-[22px]"
              style={{ background: 'rgba(255,255,255,0.5)', boxShadow: 'inset 0 0 0 1px rgba(59,10,31,0.06)' }}
            >
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-2" style={{ color: 'var(--ink-3)' }}>
                  <Camera size={28} />
                  <span className="text-sm font-medium">Take photo or upload</span>
                  <span className="text-xs">Under 30 seconds · photo first</span>
                </span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onFile(file)
              }}
            />

            <label className="field-label">Name</label>
            <input className="field mb-3" placeholder="Strawberry Cloud" value={name} onChange={(e) => setName(e.target.value)} />

            <label className="field-label">Price (USD)</label>
            <input
              className="field mb-3 tabular"
              inputMode="decimal"
              placeholder="18.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />

            <label className="field-label">Category</label>
            <div className="mb-4 flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`pill ${categoryId === c.id ? 'pill-active' : ''}`}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <label className="mb-5 flex items-center justify-between rounded-2xl px-3 py-3 glass-soft">
              <span>
                <span className="block text-sm font-semibold">Made today</span>
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  Sets best-before to {db.settings().bestBeforeDays} days from now
                </span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-[#F472B6]"
                checked={madeToday}
                onChange={(e) => setMadeToday(e.target.checked)}
              />
            </label>

            {error && (
              <p className="mb-3 rounded-xl px-3 py-2 text-sm" style={{ background: 'rgba(251,113,133,0.15)', color: '#BE123C' }}>
                {error}
              </p>
            )}

            <button type="button" className="btn-pink btn-pink-ring w-full" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save cake'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
