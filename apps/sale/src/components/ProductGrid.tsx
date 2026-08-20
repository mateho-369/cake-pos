import { Check, ChevronRight, PackageOpen, Plus, Search, Sparkles } from 'lucide-react'
import { categories, type CartItem, type Product } from '../data'

export default function ProductGrid({ products, category, onCategory, onAdd, cart, query, onQuery }: {
  products: Product[]
  category: string
  onCategory: (category: string) => void
  onAdd: (product: Product) => void
  cart: CartItem[]
  query: string
  onQuery: (value: string) => void
}) {
  return (
    <section className="product-workspace">
      <div className="sale-welcome"><div><span>THURSDAY · 20 AUGUST</span><h1>What are we serving?</h1></div><div className="freshness-legend"><span><i /> Sell first</span><small>5 items near best-before</small></div></div>
      <label className="mobile-product-search"><Search size={17} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search menu…" /></label>
      <nav className="category-tabs" aria-label="Product categories">
        {categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => onCategory(item)}>{item}{item === 'All' && <span>{products.length}</span>}</button>)}
      </nav>
      <div className="menu-meta"><span><Sparkles size={14} /> {products.length} products available</span><button>Best-before priority <ChevronRight size={14} /></button></div>
      {products.length ? (
        <div className="product-grid">
          {products.map((product) => {
            const cartQuantity = cart.find((item) => item.product.id === product.id)?.quantity || 0
            const aging = product.freshness === 'today' || product.freshness === 'tomorrow'
            return (
              <button className={`product-card ${aging ? 'aging' : ''} ${cartQuantity ? 'in-cart' : ''}`} key={product.id} onClick={() => onAdd(product)}>
                <span className="product-photo" style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { backgroundPosition: product.imagePosition }}>
                  {aging && <em className={`freshness-tag ${product.freshness}`}><i />{product.freshness === 'today' ? 'Sell today' : '1 day left'}</em>}
                  <small>{product.stock} left</small>
                  {cartQuantity > 0 && <b className="cart-quantity"><Check size={12} /> {cartQuantity}</b>}
                </span>
                <span className="product-info"><span><small>{product.category}</small><strong>{product.name}</strong></span><b>${product.price.toFixed(2)}</b></span>
                <span className="add-product"><Plus size={16} /></span>
              </button>
            )
          })}
        </div>
      ) : <div className="empty-menu glass-panel"><PackageOpen size={28} /><strong>No products found</strong><span>Try another category or search term.</span></div>}
    </section>
  )
}
