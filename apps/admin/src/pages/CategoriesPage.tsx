import { useState } from 'react'
import { GripVertical, MoreHorizontal, Plus, Tags } from 'lucide-react'
import { categories } from '../data'
import Modal from '../components/Modal'

export default function CategoriesPage({ onToast }: { onToast: (message: string) => void }) {
  const [open, setOpen] = useState(false)

  const createCategory = (event: React.FormEvent) => {
    event.preventDefault()
    setOpen(false)
    onToast('Category created')
  }

  return (
    <div className="page-content">
      <section className="page-toolbar">
        <div className="toolbar-context"><strong>Catalog organization</strong><span>Drag categories to control their order on the sale terminal.</span></div>
        <button className="primary-button" onClick={() => setOpen(true)}><Plus size={17} /> New category</button>
      </section>

      <section className="categories-layout">
        <div className="glass-panel category-list-card">
          <div className="panel-heading"><div><span className="section-kicker">Display order</span><h2>Categories</h2></div><span className="count-label">{categories.length} categories</span></div>
          <div className="category-row category-head"><span /><span>Category</span><span>Products</span><span>Active</span><span>Today’s revenue</span><span /></div>
          {categories.map((category, index) => (
            <div className="category-row" key={category.name}>
              <GripVertical size={17} className="drag-handle" />
              <div className="category-name"><i style={{ background: category.color }} /><div><strong>{category.name}</strong><small>Sale terminal position {index + 1}</small></div></div>
              <strong>{category.items}</strong><span>{category.active}</span><strong>${category.revenue.toLocaleString()}</strong><button className="icon-button" onClick={() => onToast(`Editing ${category.name}`)}><MoreHorizontal size={18} /></button>
            </div>
          ))}
        </div>

        <aside className="glass-panel category-insight">
          <div className="insight-icon"><Tags size={20} /></div>
          <span className="section-kicker">Category insight</span>
          <h2>Signature Cakes lead revenue</h2>
          <p>They contribute 32.7% of sales while holding 23% of active products.</p>
          <div className="category-bars">
            {categories.slice(0, 4).map((category) => <div key={category.name}><span><strong>{category.name}</strong><small>${category.revenue.toLocaleString()}</small></span><i><b style={{ width: `${category.revenue / 20}%`, background: category.color }} /></i></div>)}
          </div>
          <div className="insight-note"><strong>Recommendation</strong><span>Keep Signature Cakes in the first sale-terminal position for faster cashier access.</span></div>
        </aside>
      </section>

      <Modal open={open} onClose={() => setOpen(false)} eyebrow="Catalog structure" title="Create category" size="small">
        <form className="modal-form" onSubmit={createCategory}>
          <div className="form-grid">
            <label><span>Category name</span><input autoFocus placeholder="e.g. Seasonal cakes" required /></label>
            <label><span>Accent color</span><div className="color-options">{['#be185d', '#3b82f6', '#d97706', '#7c3aed', '#059669'].map((color, index) => <input key={color} type="radio" name="color" defaultChecked={index === 0} style={{ '--swatch': color } as React.CSSProperties} />)}</div></label>
            <label className="toggle-field"><span><strong>Active on sale terminal</strong><small>Cashiers can browse this category</small></span><input type="checkbox" defaultChecked /><i /></label>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button><button className="primary-button"><Plus size={16} /> Create category</button></div>
        </form>
      </Modal>
    </div>
  )
}
