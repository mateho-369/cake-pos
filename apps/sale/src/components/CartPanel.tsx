import { useState } from 'react'
import {
  Banknote,
  Check,
  Minus,
  PauseCircle,
  Plus,
  ReceiptText,
  ScanLine,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react'
import type { CartItem } from '../data'
import { splitTender } from '../lib/tender'
import { useTranslation } from '../lib/i18n'
export type PaymentMethod = 'cash' | 'khqr'
type DiscountType = 'percentage' | 'fixed'
type Props = {
  cart: CartItem[]
  orderNumber: number
  subtotal: number
  onQuantity: (id: number, delta: number) => void
  onRemove: (id: number) => void
  onClear: () => void
  discountType: DiscountType
  discountValue: string
  onDiscountType: (v: DiscountType) => void
  onDiscountValue: (v: string) => void
  payment: PaymentMethod
  onPayment: (v: PaymentMethod) => void
  tendered: string
  onTendered: (v: string) => void
  /** Independent KHR tender — mixed-currency split payment (USD + riel). */
  tenderedKhr: string
  onTenderedKhr: (v: string) => void
  /** Admin-configured USD→KHR rate (Settings → Payments), default 4100. */
  rate: number
  khqrConfirmed: boolean
  onKhqrConfirmed: (v: boolean) => void
  onComplete: () => void
  /** Park the current cart for a customer who pays later. */
  onHold: (label: string) => void
  holdBusy: boolean
  shiftOpen: boolean
  mobileOpen: boolean
  onMobileClose: () => void
}
export default function CartPanel({
  cart,
  subtotal,
  onQuantity,
  onRemove,
  onClear,
  discountType,
  discountValue,
  onDiscountType,
  onDiscountValue,
  payment,
  onPayment,
  tendered,
  onTendered,
  tenderedKhr,
  onTenderedKhr,
  rate,
  khqrConfirmed,
  onKhqrConfirmed,
  onComplete,
  onHold,
  holdBusy,
  shiftOpen,
  mobileOpen,
  onMobileClose,
  orderNumber,
}: Props) {
  const { t } = useTranslation()
  const [holdOpen, setHoldOpen] = useState(false)
  const [holdLabel, setHoldLabel] = useState('')
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const requested = Math.max(0, Number(discountValue || 0))
  const discount = Math.min(
    subtotal,
    discountType === 'percentage'
      ? (subtotal * Math.min(100, requested)) / 100
      : requested,
  )
  const total = Math.max(0, subtotal - discount)
  const totalCents = Math.round(total * 100)

  // ---- Split tender (USD + KHR, two INDEPENDENT inputs) ----
  // All integer math lives in lib/tender.ts so the exact same code is
  // unit-tested against the backend's arithmetic.
  const usdCents = Math.round(Math.max(0, Number(tendered || 0)) * 100)
  const khr = Math.max(
    0,
    Math.round(Number(tenderedKhr.replace(/[^0-9.]/g, '') || 0)),
  )
  const tender = splitTender(totalCents, usdCents, khr, rate)
  const {
    totalReceivedUsd,
    changeUsd,
    changeKhrRounded,
    shortByUsd,
    totalKhrEquivalent: khrEquivalentOfTotal,
  } = tender
  const short = cart.length > 0 && payment === 'cash' && tender.short
  // shiftOpen is deliberately NOT part of this: with items in the cart and
  // no open shift, clicking "Complete" prompts the open-shift flow instead
  // of silently refusing (the shift-required note below explains it).
  const canComplete =
    cart.length > 0 &&
    (payment === 'khqr' ? khqrConfirmed : !tender.short)
  const quickAmounts = [
    ...new Set([total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10]),
  ].filter((value) => value >= total)
  return (
    <aside className={`cart-panel ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="cart-drag-handle" />
      <header className="cart-header">
        <div>
          <span>{t('sale.currentOrder')}</span>
          <h2>{t('sale.order', { number: orderNumber })}</h2>
        </div>
        <div>
          {cart.length > 0 && (
            <button className="clear-order" onClick={onClear}>
              {t('common.clear')}
            </button>
          )}
          <button className="mobile-close-cart" onClick={onMobileClose}>
            <X size={19} />
          </button>
        </div>
      </header>
      <div className="cart-summary-strip">
        <span>
          <ShoppingBag size={15} /> {itemCount}{' '}
          {itemCount === 1 ? t('common.item') : t('common.items')}
        </span>
        <span>{t('sale.dineIn')}</span>
      </div>
      <div className="cart-items">
        {cart.length === 0 ? (
          <div className="empty-cart">
            <span>
              <ShoppingBag size={26} />
            </span>
            <strong>{t('sale.yourCartEmpty')}</strong>
            <p>{t('sale.cartHint')}</p>
          </div>
        ) : (
          cart.map(({ product, quantity }) => (
            <article className="cart-item" key={product.id}>
              <ProductImage product={product} />
              <div className="cart-item-copy">
                <strong>{product.name}</strong>
                <span>
                  ${product.price.toFixed(2)} {t('sale.each')}
                </span>
                <div className="quantity-control">
                  <button onClick={() => onQuantity(product.id, -1)}>
                    <Minus size={14} />
                  </button>
                  <b>{quantity}</b>
                  <button
                    onClick={() => onQuantity(product.id, 1)}
                    disabled={quantity >= product.stock}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <div className="cart-item-total">
                <strong>${(product.price * quantity).toFixed(2)}</strong>
                <button onClick={() => onRemove(product.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
      <div className="cart-checkout">
        <div className="discount-control">
          <div>
            <span>Discount</span>
            <div className="discount-type">
              <button
                className={discountType === 'percentage' ? 'active' : ''}
                onClick={() => onDiscountType('percentage')}
              >
                %
              </button>
              <button
                className={discountType === 'fixed' ? 'active' : ''}
                onClick={() => onDiscountType('fixed')}
              >
                $
              </button>
            </div>
          </div>
          <label>
            <span>{discountType === 'percentage' ? '%' : '$'}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={discountValue}
              onChange={(e) => onDiscountValue(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <small>
            Cashier limits are verified by the server. Larger discounts require
            an admin.
          </small>
        </div>
        <div className="total-lines">
          <span>
            <small>{t('sale.subtotal')}</small>
            <strong>${subtotal.toFixed(2)}</strong>
          </span>
          <span>
            <small>{t('sale.discount')}</small>
            <strong>{discount ? `−$${discount.toFixed(2)}` : '—'}</strong>
          </span>
          <span className="total-line">
            <small>{t('sale.total')}</small>
            <strong>${total.toFixed(2)}</strong>
          </span>
        </div>
        <div className="payment-selector">
          <button
            className={payment === 'cash' ? 'active' : ''}
            onClick={() => onPayment('cash')}
          >
            <Banknote size={18} />
            <span>
              <strong>{t('payment.cash')}</strong>
              <small>{t('sale.cashDrawer')}</small>
            </span>
            {payment === 'cash' && (
              <i>
                <Check size={12} />
              </i>
            )}
          </button>
          <button
            className={payment === 'khqr' ? 'active' : ''}
            onClick={() => onPayment('khqr')}
          >
            <ScanLine size={18} />
            <span>
              <strong>{t('payment.khqr')}</strong>
              <small>{t('sale.qrPay')}</small>
            </span>
            {payment === 'khqr' && (
              <i>
                <Check size={12} />
              </i>
            )}
          </button>
        </div>
        {cart.length > 0 && payment === 'cash' && (
          <div className="cash-payment">
            <div className="payment-section-label">
              <span>{t('sale.cashReceived')}</span>
              {!short && usdCents + khr > 0 && (
                <small>
                  {t('sale.change')}{' '}
                  <strong>${changeUsd.toFixed(2)}</strong>
                  {changeKhrRounded > 0 && (
                    <em> · ៛{changeKhrRounded.toLocaleString()}</em>
                  )}
                </small>
              )}
            </div>
            <div className="tender-inputs">
              <div className="cash-input">
                <span>$</span>
                <input
                  inputMode="decimal"
                  value={tendered}
                  onChange={(e) => onTendered(e.target.value)}
                  placeholder="0.00"
                  aria-label={t('sale.usdReceived')}
                />
                {usdCents > 0 && (
                  <small className="tender-equivalent">
                    ៛{Math.round((usdCents * rate) / 100).toLocaleString()}
                  </small>
                )}
              </div>
              <div className="cash-input khr">
                <span>៛</span>
                <input
                  inputMode="numeric"
                  value={tenderedKhr}
                  onChange={(e) => onTenderedKhr(e.target.value)}
                  placeholder="0"
                  aria-label={t('sale.khrReceived')}
                />
                {khr > 0 && (
                  <small className="tender-equivalent">
                    ${(((khr * 100) / rate / 100).toFixed(2))}
                  </small>
                )}
              </div>
            </div>
            <div className="tender-summary">
              <span>
                {t('sale.totalReceived')}{' '}
                <strong>
                  ${totalReceivedUsd.toFixed(2)}
                  {khr > 0 && ` + ៛${khr.toLocaleString()}`}
                </strong>
              </span>
              {short ? (
                <em className="tender-short">
                  {t('sale.shortTender', {
                    amount: shortByUsd.toFixed(2),
                  })}
                </em>
              ) : (
                tender.changeUsd > 0 && (
                  <em>
                    {t('sale.change')} ${changeUsd.toFixed(2)} · ៛
                    {changeKhrRounded.toLocaleString()}
                  </em>
                )
              )}
            </div>
            <div className="quick-cash">
              {quickAmounts.map((amount) => (
                <button
                  key={amount}
                  onClick={() => {
                    onTendered(amount.toFixed(2))
                    onTenderedKhr('')
                  }}
                >
                  ${amount.toFixed(amount % 1 ? 2 : 0)}
                </button>
              ))}
              <button
                onClick={() => {
                  onTendered('')
                  onTenderedKhr(String(khrEquivalentOfTotal))
                }}
              >
                ៛{khrEquivalentOfTotal.toLocaleString()}
              </button>
              <button
                onClick={() => {
                  // Split shortcut: whole dollars in USD, remainder in riel.
                  const wholeUsd = Math.floor(total)
                  onTendered(wholeUsd.toFixed(2))
                  const remainderCents = totalCents - wholeUsd * 100
                  onTenderedKhr(
                    String(Math.round((remainderCents * rate) / 100)),
                  )
                }}
              >
                $ + ៛
              </button>
            </div>
          </div>
        )}
        {cart.length > 0 && payment === 'khqr' && (
          <div className="khqr-payment">
            <div className="mini-qr">
              <i />
              <i />
              <i />
            </div>
            <div>
              <strong>
                {t('sale.staticKhqr', { total: total.toFixed(2) })}
              </strong>
              {/* Informational only: KHQR payments stay USD-denominated. */}
              <span>
                {t('sale.khqrKhrEquivalent', {
                  khr: khrEquivalentOfTotal.toLocaleString(),
                })}
              </span>
              <label>
                <input
                  type="checkbox"
                  checked={khqrConfirmed}
                  onChange={(e) => onKhqrConfirmed(e.target.checked)}
                />
                <i>{khqrConfirmed && <Check size={11} />}</i>{' '}
                {t('sale.paymentReceived')}
              </label>
            </div>
          </div>
        )}
        {!shiftOpen && (
          <div className="shift-required">{t('sale.openShiftPayment')}</div>
        )}
        {cart.length > 0 && (
          <div className="cart-hold">
            {holdOpen ? (
              <div className="cart-hold-form">
                <label>
                  <span>{t('hold.labelPlaceholder')}</span>
                  <input
                    type="text"
                    value={holdLabel}
                    maxLength={80}
                    placeholder={t('hold.labelExample')}
                    onChange={(event) => setHoldLabel(event.target.value)}
                  />
                </label>
                <div className="cart-hold-buttons">
                  <button
                    className="cart-hold-cancel"
                    onClick={() => {
                      setHoldOpen(false)
                      setHoldLabel('')
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    className="cart-hold-confirm"
                    disabled={holdBusy}
                    onClick={() => {
                      onHold(holdLabel.trim())
                      setHoldOpen(false)
                      setHoldLabel('')
                    }}
                  >
                    <PauseCircle size={15} /> {t('hold.confirm')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="cart-hold-button"
                disabled={holdBusy}
                onClick={() => setHoldOpen(true)}
              >
                <PauseCircle size={16} /> {t('hold.holdOrder')}
              </button>
            )}
          </div>
        )}
        <button
          className="complete-payment"
          onClick={onComplete}
          disabled={!canComplete}
        >
          <ReceiptText size={18} />
          {cart.length === 0
            ? t('sale.addItems')
            : payment === 'cash'
              ? t('sale.completeCash', { total: total.toFixed(2) })
              : t('sale.confirmKhqr', { total: total.toFixed(2) })}
        </button>
      </div>
    </aside>
  )
}
function ProductImage({ product }: { product: CartItem['product'] }) {
  return (
    <span
      className="cart-product-image"
      style={
        product.imageUrl
          ? {
              backgroundImage: `url(${product.imageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : { backgroundPosition: product.imagePosition }
      }
    />
  )
}
