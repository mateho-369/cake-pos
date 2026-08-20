import { useEffect, useState } from 'react'
import { Camera, Check, Clock3, ImagePlus, Plus, Sparkles, Upload } from 'lucide-react'
import { categories, type Product } from '../data'
import Modal from './Modal'

export default function QuickAddModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (product: Product) => void }) {
  const [photo, setPhoto] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('Signature')
  const [madeToday, setMadeToday] = useState(true)

  useEffect(() => {
    if (!open) return
    setPhoto(null)
    setName('')
    setPrice('')
    setCategory('Signature')
    setMadeToday(true)
  }, [open])

  const selectPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) setPhoto(URL.createObjectURL(file))
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    onAdd({
      id: Date.now(),
      name,
      category,
      price: Number(price),
      stock: 1,
      imagePosition: '0% 0%',
      imageUrl: photo || undefined,
      freshness: 'fresh',
      bestBefore: madeToday ? 'Aug 23' : 'Aug 22',
    })
  }

  return (
    <Modal open={open} onClose={onClose} eyebrow="QUICK ENTRY · UNDER 30 SECONDS" title="Add a fresh cake" size="large" sheet>
      <form className="quick-add-layout" onSubmit={submit}>
        <label className={`photo-capture ${photo ? 'has-photo' : ''}`} style={photo ? { backgroundImage: `url(${photo})` } : undefined}>
          <input type="file" accept="image/*" capture="environment" onChange={selectPhoto} />
          {!photo ? <><span><Camera size={29} /></span><strong>Take or upload a photo</strong><small>Photo first—make it easy to recognize at checkout.</small><em><Upload size={15} /> Choose photo</em></> : <em className="replace-photo"><ImagePlus size={15} /> Replace photo</em>}
        </label>
        <div className="quick-add-fields">
          <div className="quick-add-intro"><Sparkles size={17} /><span><strong>Only the essentials</strong><small>You can edit stock and details later in Admin Control.</small></span></div>
          <div className="field-grid"><label><span>Cake name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Strawberry Cloud" required /></label><label><span>Price</span><div className="currency-input"><span>$</span><input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" min="0" type="number" step="0.01" required /></div></label></div>
          <label className="category-field"><span>Category</span><div className="quick-category-chips">{categories.filter((item) => !['All','Drinks'].includes(item)).map((item) => <button type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{category === item && <Check size={12} />}{item}</button>)}</div></label>
          <label className="made-today-row"><span><Clock3 size={18} /><span><strong>Made today</strong><small>{madeToday ? 'Best-before automatically set to Aug 23' : 'Best-before set to Aug 22'}</small></span></span><input type="checkbox" checked={madeToday} onChange={(event) => setMadeToday(event.target.checked)} /><i /></label>
          <div className="best-before-note"><span>FRESHNESS AUTOMATION</span><strong>{madeToday ? '3-day window' : '2-day window'}</strong><small>This product will be prioritized automatically as it approaches best-before.</small></div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button"><Plus size={17} /> Add & publish</button></div>
        </div>
      </form>
    </Modal>
  )
}
