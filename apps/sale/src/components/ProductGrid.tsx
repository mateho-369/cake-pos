import { Check, PackageOpen, Plus, Search, Sparkles } from 'lucide-react'
import { type CartItem, type Product } from '../data'
import type { CSSProperties } from 'react'
import { useSaleData } from '../lib/data'
import { useTranslation } from '../lib/i18n'
function productPhotoStyle(product: Product): CSSProperties {
  const primary = product.images?.[0]?.url || product.imageUrl
  return primary
    ? {
        backgroundImage: `url(${primary})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { backgroundPosition: product.imagePosition }
}
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
  const { categories, categoryList } = useSaleData()
  const now = new Date()
  const todayLabel = `${now
    .toLocaleDateString('en', { weekday: 'long' })
    .toUpperCase()} · ${now.getDate()} ${now
    .toLocaleDateString('en', { month: 'long' })
    .toUpperCase()}`
  const nearBestBefore = products.filter(
    (product) =>
      product.freshness === 'today' || product.freshness === 'tomorrow',
  ).length
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
    'Party Hats': 'catalog.partyHats',
    'Party Decor': 'catalog.partyDecor',
    'Party Décor': 'catalog.partyDecor',
    'Party Supplies': 'catalog.partySupplies',
    Toys: 'catalog.toys',
    'Toys & Games': 'catalog.toys',
  }
  const categoryLabel = (item: string) => t(categoryKeys[item] || item)
  // Subcategories (one level) get an indentation marker so cashiers see
  // they belong to a parent category — mirrors the admin picker and shop.
  const parentIds = new Set(
    categoryList
      .map((category) => category.parentId)
      .filter((id): id is number => typeof id === 'number'),
  )
  const isSubcategory = (name: string) => {
    const match = categoryList.find((category) => category.name === name)
    return Boolean(match?.parentId && parentIds.has(match.parentId))
  }
  return (
    <section className="product-workspace">
      <div className="sale-welcome">
        <div>
          <span>{todayLabel}</span>
          <h1>{t('sale.welcome')}</h1>
        </div>
        <div className="freshness-legend">
          <span>
            <i /> {t('sale.sellFirst')}
          </span>
          <small>
            {nearBestBefore > 0
              ? t('sale.nearBestBefore', { count: nearBestBefore })
              : t('sale.allFresh')}
          </small>
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
            {isSubcategory(item) && <i className="subcategory-mark">↳ </i>}
            {categoryLabel(item)}
            {item === 'All' && <span>{products.length}</span>}
          </button>
        ))}
      </nav>
      <div className="menu-meta">
        <span>
          <Sparkles size={14} />{' '}
          {t('sale.productCount', { count: products.length })}
        </span>
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
                  style={productPhotoStyle(product)}
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
                    <small>{categoryLabel(product.category)}</small>
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
