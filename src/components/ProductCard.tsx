import type { Product } from '../types'
import { money } from '../lib/money'
import { freshness, freshnessBadge, freshnessLabel } from '../lib/freshness'

export default function ProductCard({
  product,
  onAdd,
}: {
  product: Product
  onAdd: (product: Product) => void
}) {
  const kind = freshness(product)
  const glow = kind === 'today' || kind === 'expired' ? 'urgent' : kind === 'soon' ? 'expiring' : ''

  return (
    <button type="button" className={`product-card ${glow}`} onClick={() => onAdd(product)}>
      <div className="relative aspect-[4/3] overflow-hidden">
        <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
        <span className={`${freshnessBadge(kind)} absolute left-2.5 top-2.5 backdrop-blur-md`}>
          {freshnessLabel(product)}
        </span>
        {product.stockQty <= 2 && (
          <span className="badge absolute right-2.5 top-2.5 bg-white/80 text-[var(--pink-deep)]">
            {product.stockQty} left
          </span>
        )}
      </div>
      <div className="px-3 pb-3 pt-2.5">
        <p className="truncate text-[0.92rem] font-semibold tracking-tight">{product.name}</p>
        <p className="price mt-0.5 text-[1.05rem]">{money(product.price)}</p>
      </div>
    </button>
  )
}
