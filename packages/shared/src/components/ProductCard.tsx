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
      <div className="relative aspect-[5/4] overflow-hidden bg-[rgba(59,10,31,0.06)]">
        <img src={product.imageUrl} alt={product.name} />
        <span className={`${freshnessBadge(kind)} absolute left-2 top-2`}>{freshnessLabel(product)}</span>
        {product.stockQty <= 2 && (
          <span className="badge absolute right-2 top-2 bg-white/90 text-[var(--pink-deep)]">{product.stockQty} left</span>
        )}
      </div>
      <div className="px-2.5 pb-2.5 pt-2">
        <p className="line-clamp-2 min-h-[2.3em] text-[0.82rem] font-semibold leading-snug tracking-tight">{product.name}</p>
        <p className="price mt-0.5 text-[1.02rem]">{money(product.price)}</p>
      </div>
    </button>
  )
}
