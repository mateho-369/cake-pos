import { daysUntil } from './money'
import type { Product } from '../types'

export type Freshness = 'fresh' | 'soon' | 'today' | 'expired'

export function freshness(product: Product, from?: string): Freshness {
  const d = daysUntil(product.bestBefore, from)
  if (d < 0) return 'expired'
  if (d === 0) return 'today'
  if (d === 1) return 'soon'
  return 'fresh'
}

export function freshnessLabel(product: Product) {
  const kind = freshness(product)
  const d = daysUntil(product.bestBefore)
  if (kind === 'expired') return 'Expired'
  if (kind === 'today') return 'Sell today'
  if (kind === 'soon') return '1 day left'
  return `${d}d left`
}

export function freshnessBadge(kind: Freshness) {
  if (kind === 'fresh') return 'badge badge-fresh'
  if (kind === 'soon') return 'badge badge-amber'
  return 'badge badge-coral'
}
