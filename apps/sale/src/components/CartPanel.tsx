import {
  Banknote,
  Check,
  Minus,
  Plus,
  ReceiptText,
  ScanLine,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react'
import type { CartItem } from '../data'

export type PaymentMethod = 'cash' | 'khqr'

export default function CartPanel({
  cart,
  subtotal,
  onQuantity,
  onRemove,
  onClear,
  payment,
  onPayment,
  tendered,
  onTendered,
  khqrConfirmed,
  onKhqrConfirmed,
  onComplete,
  shiftOpen,
  mobileOpen,
  onMobileClose,
  orderNumber,
}: {
  cart: CartItem[]
  orderNumber: number
  subtotal: number
  onQuantity: (productId: number, delta: number) => void
  onRemove: (productId: number) => void
  onClear: () => void
  payment: PaymentMethod
  onPayment: (method: PaymentMethod) => void
  tendered: string
  onTendered: (value: string) => void
  khqrConfirmed: boolean
  onKhqrConfirmed: (value: boolean) => void
  onComplete: () => void
  shiftOpen: boolean
  mobileOpen: boolean
  onMobileClose: () => void
}) {
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const tenderedAmount = Number(tendered || 0)
  const change = Math.max(0, tenderedAmount - subtotal)
  const canComplete = shiftOpen && cart.length > 0 && (payment === 'khqr' ? khqrConfirmed : tenderedAmount >= subtotal)
  const quickAmounts = [...new Set([subtotal, Math.ceil(subtotal / 5) * 5, Math.ceil(subtotal / 10) * 10])].filter((value) => value >= subtotal)

  return (
    <aside className={`cart-panel ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="cart-drag-handle" />
      <header className="cart-header"><div><span>CURRENT ORDER</span><h2>Order #{orderNumber}</h2></div><div>{cart.length > 0 && <button className="clear-order" onClick={onClear}>Clear</button>}<button className="mobile-close-cart" onClick={onMobileClose}><X size={19} /></button></div></header>
      <div className="cart-summary-strip"><span><ShoppingBag size={15} /> {itemCount} {itemCount === 1 ? 'item' : 'items'}</span><span>Dine-in counter</span></div>

      <div className="cart-items">
        {cart.length === 0 ? (
          <div className="empty-cart"><span><ShoppingBag size={26} /></span><strong>Your cart is empty</strong><p>Tap a cake from the menu to start an order.</p></div>
        ) : cart.map(({ product, quantity }) => (
          <article className="cart-item" key={product.id}>
            <ProductImage product={product} />
            <div className="cart-item-copy"><strong>{product.name}</strong><span>${product.price.toFixed(2)} each</span><div className="quantity-control"><button onClick={() => onQuantity(product.id, -1)} aria-label={`Decrease ${product.name}`}><Minus size={14} /></button><b>{quantity}</b><button onClick={() => onQuantity(product.id, 1)} disabled={quantity >= product.stock} aria-label={`Increase ${product.name}`}><Plus size={14} /></button></div></div>
            <div className="cart-item-total"><strong>${(product.price * quantity).toFixed(2)}</strong><button onClick={() => onRemove(product.id)} aria-label={`Remove ${product.name}`}><Trash2 size={14} /></button></div>
          </article>
        ))}
      </div>

      <div className="cart-checkout">
        <div className="total-lines"><span><small>Subtotal</small><strong>${subtotal.toFixed(2)}</strong></span><span><small>Discount</small><strong>—</strong></span><span className="total-line"><small>Total</small><strong>${subtotal.toFixed(2)}</strong></span></div>
        <div className="payment-selector"><button className={payment === 'cash' ? 'active' : ''} onClick={() => onPayment('cash')}><Banknote size={18} /><span><strong>Cash</strong><small>Cash drawer</small></span>{payment === 'cash' && <i><Check size={12} /></i>}</button><button className={payment === 'khqr' ? 'active' : ''} onClick={() => onPayment('khqr')}><ScanLine size={18} /><span><strong>KHQR</strong><small>QR Pay</small></span>{payment === 'khqr' && <i><Check size={12} /></i>}</button></div>

        {cart.length > 0 && payment === 'cash' && <div className="cash-payment"><div className="payment-section-label"><span>Cash received</span>{tenderedAmount >= subtotal && <small>Change <strong>${change.toFixed(2)}</strong></small>}</div><div className="cash-input"><span>$</span><input inputMode="decimal" value={tendered} onChange={(event) => onTendered(event.target.value)} placeholder="0.00" /></div><div className="quick-cash">{quickAmounts.map((amount) => <button key={amount} onClick={() => onTendered(amount.toFixed(2))}>${amount.toFixed(amount % 1 ? 2 : 0)}</button>)}</div></div>}

        {cart.length > 0 && payment === 'khqr' && <div className="khqr-payment"><div className="mini-qr"><i /><i /><i /></div><div><strong>Static KHQR · ${subtotal.toFixed(2)}</strong><span>Ask customer to scan, then confirm receipt.</span><label><input type="checkbox" checked={khqrConfirmed} onChange={(event) => onKhqrConfirmed(event.target.checked)} /><i>{khqrConfirmed && <Check size={11} />}</i> Payment received</label></div></div>}

        {!shiftOpen && <div className="shift-required">Open your shift before taking payment.</div>}
        <button className="complete-payment" onClick={onComplete} disabled={!canComplete}><ReceiptText size={18} />{cart.length === 0 ? 'Add items to continue' : payment === 'cash' ? `Complete cash · $${subtotal.toFixed(2)}` : `Confirm KHQR · $${subtotal.toFixed(2)}`}</button>
      </div>
    </aside>
  )
}

function ProductImage({ product }: { product: CartItem['product'] }) {
  return <span className="cart-product-image" style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { backgroundPosition: product.imagePosition }} />
}
