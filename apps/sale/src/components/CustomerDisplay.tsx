import { useEffect, useState } from 'react'
import { Heart, ShoppingBag } from 'lucide-react'
import { GCakeLogo } from '@cake-pos/brand'
import type { CartItem } from '../data'
import { useTranslation } from '../lib/i18n'

type DisplayState = {
  cart: CartItem[]
  subtotal: number
  total: number
  paymentState: 'idle' | 'success'
  orderId?: string
}
const initial: DisplayState = {
  cart: [],
  subtotal: 0,
  total: 0,
  paymentState: 'idle',
}
export default function CustomerDisplay() {
  const { t } = useTranslation()
  const [state, setState] = useState<DisplayState>(initial)
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return
    const channel = new BroadcastChannel('cake-pos-cart')
    const receive = (event: MessageEvent<DisplayState>) => setState(event.data)
    channel.onmessage = receive
    return () => channel.close()
  }, [])
  if (state.paymentState === 'success')
    return (
      <main className="customer-display success">
        <GCakeLogo size={96} className="brand-logo" />
        <span>{t('sale.paymentComplete')}</span>
        <h1>{t('display.thankYou')}</h1>
        <p>{t('display.orderNumber', { number: state.orderId || '' })}</p>
        <small>{t('display.ready')}</small>
        <button
          type="button"
          className="display-return"
          onClick={() => window.close()}
        >
          {t('display.closeAndReturn')}
        </button>
      </main>
    )
  return (
    <main className="customer-display">
      <header>
        <GCakeLogo size={68} className="brand-logo" />
        <div>
          <strong>{t('brand.name')}</strong>
          <small>{t('display.customerView')}</small>
        </div>
      </header>
      <section className="display-content">
        {state.cart.length === 0 ? (
          <div className="display-empty">
            <ShoppingBag size={64} />
            <h1>{t('display.welcome')}</h1>
            <p>{t('display.waiting')}</p>
          </div>
        ) : (
          <>
            <h1>{t('display.yourOrder')}</h1>
            <div className="display-lines">
              {state.cart.map(({ product, quantity }) => (
                <div key={product.id}>
                  <span>
                    {quantity} × {product.name}
                  </span>
                  <strong>${(product.price * quantity).toFixed(2)}</strong>
                </div>
              ))}
            </div>
            <footer>
              <div>
                <span>{t('display.subtotal')}</span>
                <strong>${state.subtotal.toFixed(2)}</strong>
              </div>
              <div className="display-total">
                <span>{t('display.total')}</span>
                <strong>${state.total.toFixed(2)}</strong>
              </div>
            </footer>
          </>
        )}
      </section>
      <small className="display-powered">
        <Heart size={13} /> {t('display.thankYou')}
      </small>
      <button
        type="button"
        className="display-return"
        onClick={() => window.close()}
      >
        {t('display.closeAndReturn')}
      </button>
    </main>
  )
}
