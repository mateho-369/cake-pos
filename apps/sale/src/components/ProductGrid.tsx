import {
  Check,
  ChevronRight,
  PackageOpen,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react'
import { type CartItem, type Product } from '../data'
import { useSaleData } from '../lib/data'
import { useTranslation } from '../lib/i18n'
export default function ProductGrid({
  products,
  category,
  onCategory,
  onAdd,
  cart,
  query,
  onQuery,
}: {
  products: Product[]
  category: string
  onCategory: (category: string) => void
  onAdd: (product: Product) => void
  cart: CartItem[]
  query: string
  onQuery: (value: string) => void
}) {
  const { t } = useTranslation()
  const { categories } = useSaleData()
  const categoryKeys: Record<string, string> = {
    All: 'sale.allCategory',
    Signature: 'sale.signatureCategory',
    'Signature Cakes': 'sale.signatureCategory',
    'Whole cakes': 'sale.wholeCakes',
    'Birthday Cakes': 'sale.wholeCakes',
    Cheesecakes: 'sale.wholeCakes',
    Chocolate: 'sale.wholeCakes',
    'Mini cakes': 'sale.miniCakes',
    'Mini Cakes': 'sale.miniCakes',
    Slices: 'sale.slices',
    Cupcakes: 'sale.cupcakes',
    Drinks: 'sale.drinks',
  }
  return (
    <section className="product-workspace">
      <div className="sale-welcome">
        <div>
          <span>{t('sale.date')}</span>
          <h1>{t('sale.welcome')}</h1>
        </div>
        <div className="freshness-legend">
          <span>
            <i /> {t('sale.sellFirst')}
          </span>
          <small>{t('sale.nearBestBefore')}</small>
        </div>
      </div>
      <label className="mobile-product-search">
        <Search size={17} />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={t('sale.searchMenu')}
        />
      </label>
      <nav className="category-tabs" aria-label={t('catalog.category')}>
        {categories.map((item) => (
          <button
            key={item}
            className={category === item ? 'active' : ''}
            onClick={() => onCategory(item)}
          >
            {t(categoryKeys[item] || 'sale.wholeCakes')}
            {item === 'All' && <span>{products.length}</span>}
          </button>
        ))}
      </nav>
      <div className="menu-meta">
        <span>
          <Sparkles size={14} />{' '}
          {t('sale.productCount', { count: products.length })}
        </span>
        <button>
          {t('sale.bestBeforePriority')} <ChevronRight size={14} />
        </button>
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map((product) => {
            const cartQuantity =
              cart.find((item) => item.product.id === product.id)?.quantity || 0
            const aging =
              product.freshness === 'today' || product.freshness === 'tomorrow'
            return (
              <button
                className={`product-card ${aging ? 'aging' : ''} ${cartQuantity ? 'in-cart' : ''}`}
                key={product.id}
                onClick={() => onAdd(product)}
              >
                <span
                  className="product-photo"
                  style={
                    product.imageUrl
                      ? {
                          backgroundImage: `url(${product.imageUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : { backgroundPosition: product.imagePosition }
                  }
                >
                  {aging && (
                    <em className={`freshness-tag ${product.freshness}`}>
                      <i />
                      {product.freshness === 'today'
                        ? t('sale.sellToday')
                        : t('sale.oneDayLeft')}
                    </em>
                  )}
                  <small>{t('sale.stockLeft', { count: product.stock })}</small>
                  {cartQuantity > 0 && (
                    <b className="cart-quantity">
                      <Check size={12} /> {cartQuantity}
                    </b>
                  )}
                </span>
                <span className="product-info">
                  <span>
                    <small>
                      {t(categoryKeys[product.category] || 'sale.wholeCakes')}
                    </small>
                    <strong>{product.name}</strong>
                  </span>
                  <b>${product.price.toFixed(2)}</b>
                </span>
                <span className="add-product">
                  <Plus size={16} />
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="empty-menu glass-panel">
          <PackageOpen size={28} />
          <strong>{t('sale.noProducts')}</strong>
          <span>{t('sale.tryCategory')}</span>
        </div>
      )}
    </section>
  )
}
