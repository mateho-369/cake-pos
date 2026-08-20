import { useMemo, useState } from 'react'
import {
  Archive,
  ChevronDown,
  Columns3,
  Download,
  Edit3,
  Filter,
  MoreHorizontal,
  PackagePlus,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { products, type Product } from '../data'
import Modal from '../components/Modal'

type ProductsPageProps = {
  onAdd: () => void
  onToast: (message: string) => void
}

export default function ProductsPage({ onAdd, onToast }: ProductsPageProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All products')
  const [editing, setEditing] = useState<Product | null>(null)
  const [view, setView] = useState<'table' | 'grid'>('table')

  const visible = useMemo(() => products.filter((product) => {
    const matchesQuery = `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase())
    if (filter === 'Active') return matchesQuery && product.active
    if (filter === 'Freshness risk') return matchesQuery && ['1 day left', 'Expires today', 'Expired'].includes(product.status)
    if (filter === 'Out of stock') return matchesQuery && product.stock === 0
    return matchesQuery
  }), [query, filter])

  const saveEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEditing(null)
    onToast('Product details saved')
  }

  return (
    <div className="page-content">
      <section className="catalog-summary">
        <div><span>All products</span><strong>52</strong><small>48 currently active</small></div>
        <div><span>Units on hand</span><strong>186</strong><small>$2,946 retail value</small></div>
        <div><span>Freshness risk</span><strong className="coral-text">5</strong><small>$146 value at risk</small></div>
        <div><span>Sold today</span><strong>82</strong><small>68% daily sell-through</small></div>
      </section>

      <section className="page-toolbar catalog-toolbar">
        <div className="filter-row">
          <label className="inline-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products, categories…" /></label>
          <div className="filter-tabs">
            {['All products', 'Active', 'Freshness risk', 'Out of stock'].map((item) => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="icon-button" onClick={() => setView(view === 'table' ? 'grid' : 'table')} title="Change view"><Columns3 size={18} /></button>
          <button className="secondary-button"><SlidersHorizontal size={16} /> Filters</button>
          <button className="primary-button" onClick={onAdd}><Plus size={17} /> Add cake</button>
        </div>
      </section>

      {view === 'table' ? (
        <section className="glass-panel catalog-table table-responsive">
          <div className="catalog-table-head catalog-row">
            <label><input type="checkbox" /> Product</label><span>Freshness</span><span>Stock</span><span>Price</span><span>Today</span><span>Status</span><span />
          </div>
          {visible.map((product) => (
            <div className="catalog-row" key={product.id}>
              <div className="catalog-product"><input type="checkbox" /><span className="catalog-image" style={{ backgroundPosition: product.imagePosition }} /><div><strong>{product.name}</strong><small>{product.category} · SKU CK-{String(product.id).padStart(3, '0')}</small></div></div>
              <div><span className={`freshness-badge ${statusClass(product.status)}`}>{product.status}</span><small className="block-note">Best before {product.bestBefore.replace(', 2026', '')}</small></div>
              <div className="stock-cell"><strong>{product.stock}</strong><span>units</span></div>
              <strong className="numeric">${product.price.toFixed(2)}</strong>
              <div><strong>{product.sold} sold</strong><small className="block-note">${product.revenue}</small></div>
              <span className={`status-badge ${product.active ? 'success' : 'neutral'}`}><i />{product.active ? 'Active' : 'Archived'}</span>
              <button className="icon-button" onClick={() => setEditing(product)} aria-label={`Edit ${product.name}`}><MoreHorizontal size={18} /></button>
            </div>
          ))}
          {visible.length === 0 && <div className="empty-state"><Search size={24} /><strong>No products found</strong><span>Try another search or filter.</span></div>}
          <div className="table-footer"><span>Showing {visible.length} of 52 products</span><div><button disabled>Previous</button><button>1</button><button>2</button><button>Next</button></div></div>
        </section>
      ) : (
        <section className="catalog-card-grid">
          {visible.map((product) => (
            <article className="glass-panel catalog-card" key={product.id}>
              <div className="catalog-card-image" style={{ backgroundPosition: product.imagePosition }}><span className={`freshness-badge ${statusClass(product.status)}`}>{product.status}</span><button className="icon-button" onClick={() => setEditing(product)}><MoreHorizontal size={18} /></button></div>
              <div className="catalog-card-copy"><span>{product.category}</span><h3>{product.name}</h3><div><strong>${product.price}</strong><span>{product.stock} in stock</span></div></div>
            </article>
          ))}
        </section>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} eyebrow="Catalog item" title="Edit product" size="medium">
        {editing && (
          <form className="modal-form" onSubmit={saveEdit}>
            <div className="edit-product-summary"><span className="edit-product-image" style={{ backgroundPosition: editing.imagePosition }} /><div><span>CK-{String(editing.id).padStart(3, '0')}</span><strong>{editing.name}</strong><small>Created {editing.madeAt}</small></div></div>
            <div className="form-grid two-columns">
              <label><span>Product name</span><input defaultValue={editing.name} required /></label>
              <label><span>Category</span><select defaultValue={editing.category}><option>Signature Cakes</option><option>Chocolate</option><option>Cheesecakes</option><option>Birthday Cakes</option><option>Mini Cakes</option></select><ChevronDown size={15} /></label>
              <label><span>Price (USD)</span><input type="number" step="0.01" defaultValue={editing.price} required /></label>
              <label><span>Stock quantity</span><input type="number" defaultValue={editing.stock} required /></label>
              <label><span>Made at</span><input type="date" defaultValue="2026-08-20" /></label>
              <label><span>Best before</span><input type="date" defaultValue="2026-08-23" /></label>
            </div>
            <label className="toggle-field"><span><strong>Available for sale</strong><small>Visible on the sale terminal</small></span><input type="checkbox" defaultChecked={editing.active} /><i /></label>
            <div className="modal-actions split-actions"><button type="button" className="danger-text-button"><Archive size={16} /> Archive</button><span><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button"><Edit3 size={16} /> Save changes</button></span></div>
          </form>
        )}
      </Modal>
    </div>
  )
}

function statusClass(status: Product['status']) {
  if (status === 'Fresh') return 'fresh'
  if (status === '1 day left') return 'warning'
  return 'danger'
}
