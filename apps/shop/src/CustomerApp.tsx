import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  CakeSlice,
  Check,
  ChevronLeft,
  Minus,
  Phone,
  Plus,
  Send,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react'
import { GCakeLogo } from '@cake-pos/brand'
import { apiRequest } from './lib/api'
import type { Product } from './data'
import { useTelegramIdentity } from './telegram/useTelegramIdentity'
import { LanguageToggle, useTranslation } from './lib/i18n'

type Customer = {
  name: string
  username?: string | null
  phone?: string | null
}
type CustomerOrder = {
  id: string
  total: number
  status: string
  detail: string[]
}
type MenuResponse = {
  customer: Customer
  products: Product[]
  khqrImageUrl?: string
}
type Cart = Record<number, number>
const statusSteps = ['Pending', 'Confirmed', 'Paid', 'Ready']

export default function CustomerApp() {
  const { webApp, initData, botUrl, launchedInTelegram } = useTelegramIdentity()
  const { t } = useTranslation()
  const [menu, setMenu] = useState<MenuResponse | null>(null)
  const [cart, setCart] = useState<Cart>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [contactPrompt, setContactPrompt] = useState(false)
  const [order, setOrder] = useState<CustomerOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!initData) {
      setLoading(false)
      setError(t('errors.telegram'))
      return
    }
    apiRequest<MenuResponse>('/api/customer-products', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    })
      .then(setMenu)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : t('errors.menu')),
      )
      .finally(() => setLoading(false))
  }, [initData])

  useEffect(() => {
    if (!order || ['Ready', 'Completed'].includes(order.status)) return
    const timer = window.setInterval(async () => {
      try {
        setOrder(
          await apiRequest<CustomerOrder>(
            `/api/customer-orders/${order.id}/status`,
            { method: 'POST', body: JSON.stringify({ initData }) },
          ),
        )
      } catch {
        /* keep last known status */
      }
    }, 7000)
    return () => window.clearInterval(timer)
  }, [order?.id, order?.status, initData])

  const items = useMemo(
    () =>
      menu?.products
        .filter((product) => cart[product.id])
        .map((product) => ({ product, quantity: cart[product.id] })) || [],
    [menu, cart],
  )
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  const total = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  )
  const change = (product: Product, delta: number) =>
    setCart((current) => {
      const quantity = Math.max(
        0,
        Math.min(product.stock, (current[product.id] || 0) + delta),
      )
      const next = { ...current, [product.id]: quantity }
      if (!quantity) delete next[product.id]
      return next
    })

  const waitForPhone = async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const profile = await apiRequest<Customer>('/api/customer-profile', {
        method: 'POST',
        body: JSON.stringify({ initData }),
      })
      if (profile.phone) {
        setMenu((current) =>
          current ? { ...current, customer: profile } : current,
        )
        return profile.phone
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1000))
    }
    throw new Error(t('errors.phone'))
  }
  const requestPhone = async () => {
    setContactPrompt(false)
    setSending(true)
    setError(null)
    try {
      if (!webApp?.requestContact) throw new Error(t('errors.phoneTelegram'))
      await new Promise<void>((resolve, reject) =>
        webApp.requestContact?.((granted) =>
          granted
            ? resolve()
            : reject(new Error('Phone sharing was cancelled.')),
        ),
      )
      await waitForPhone()
      await submitOrder(true)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not get your phone',
      )
    } finally {
      setSending(false)
    }
  }
  const submitOrder = async (phoneConfirmed = false) => {
    if (!menu?.customer.phone && !phoneConfirmed) {
      setContactPrompt(true)
      return
    }
    setSending(true)
    setError(null)
    try {
      const result = await apiRequest<{ order: CustomerOrder }>(
        '/api/customer-orders',
        {
          method: 'POST',
          body: JSON.stringify({
            initData,
            items: items.map(({ product, quantity }) => ({
              productId: product.id,
              quantity,
            })),
            requestedTotal: Number(total.toFixed(2)),
          }),
        },
      )
      setOrder(result.order)
      setCart({})
      setCartOpen(false)
      webApp?.HapticFeedback?.notificationOccurred?.('success')
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not send your order',
      )
    } finally {
      setSending(false)
    }
  }

  if (!launchedInTelegram)
    return (
      <main className="customer-state telegram-only">
        <span>
          <Send />
        </span>
        <strong>{t('gate.title')}</strong>
        <p>{t('gate.body')}</p>
        <a href={botUrl}>{t('gate.open')}</a>
      </main>
    )
  if (loading)
    return (
      <main className="customer-state">
        <span className="customer-loader">
          <CakeSlice />
        </span>
        <strong>{t('loading')}</strong>
      </main>
    )
  if (!menu)
    return (
      <main className="customer-state">
        <span>
          <CakeSlice />
        </span>
        <strong>{t('unavailable')}</strong>
        <p>{error}</p>
      </main>
    )
  if (order)
    return (
      <OrderStatus
        order={order}
        khqrImageUrl={menu.khqrImageUrl}
        onBack={() => setOrder(null)}
      />
    )

  return (
    <main className="customer-app">
      <header className="customer-header">
        <div className="customer-brand">
          <GCakeLogo size={38} className="brand-logo" />
          <div>
            <strong>G-Cake</strong>
            <small>FRESHLY MADE FOR YOU</small>
          </div>
        </div>
        <LanguageToggle />
        <div className="customer-greeting">
          <small>{t('menu.welcome')}</small>
          <strong>{menu.customer.name.split(' ')[0]}</strong>
        </div>
      </header>
      <section className="customer-hero">
        <span>
          <Sparkles size={13} /> TODAY’S BAKES
        </span>
        <h1>
          A little joy,
          <br />
          <em>made fresh.</em>
        </h1>
        <p>
          Choose your favorites and we’ll confirm every detail with you in
          Telegram.
        </p>
      </section>
      <section className="customer-menu">
        <div className="customer-section-title">
          <div>
            <span>OUR MENU</span>
            <h2>Fresh from the kitchen</h2>
          </div>
          <small>{menu.products.length} treats today</small>
        </div>
        <div className="customer-grid">
          {menu.products.map((product) => {
            const quantity = cart[product.id] || 0
            return (
              <article
                className={`customer-product ${quantity ? 'selected' : ''}`}
                key={product.id}
              >
                <button
                  className="customer-product-photo"
                  style={productImageStyle(product)}
                  onClick={() => change(product, 1)}
                  aria-label={`Add ${product.name}`}
                >
                  <i>Fresh today</i>
                  {quantity > 0 && <b>{quantity}</b>}
                </button>
                <div className="customer-product-copy">
                  <small>{product.category}</small>
                  <strong>{product.name}</strong>
                  <div>
                    <span>${product.price.toFixed(2)}</span>
                    {quantity ? (
                      <span className="customer-stepper">
                        <button onClick={() => change(product, -1)}>
                          <Minus size={13} />
                        </button>
                        <b>{quantity}</b>
                        <button onClick={() => change(product, 1)}>
                          <Plus size={13} />
                        </button>
                      </span>
                    ) : (
                      <button
                        className="customer-add"
                        onClick={() => change(product, 1)}
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>
      {count > 0 && (
        <button
          className="customer-cart-dock"
          onClick={() => setCartOpen(true)}
        >
          <span>
            <ShoppingBag size={19} />
            <b>{count}</b>
            <strong>View your order</strong>
          </span>
          <em>${total.toFixed(2)}</em>
        </button>
      )}
      {cartOpen && (
        <>
          <button
            className="customer-sheet-backdrop"
            onClick={() => setCartOpen(false)}
            aria-label="Close cart"
          />
          <aside className="customer-cart-sheet">
            <i />
            <header>
              <div>
                <small>YOUR ORDER</small>
                <h2>Sweet choices</h2>
              </div>
              <button onClick={() => setCartOpen(false)}>
                <X size={19} />
              </button>
            </header>
            <div className="customer-cart-items">
              {items.map(({ product, quantity }) => (
                <div className="customer-cart-row" key={product.id}>
                  <span
                    className="customer-cart-thumb"
                    style={productImageStyle(product)}
                  />
                  <div>
                    <strong>{product.name}</strong>
                    <small>${product.price.toFixed(2)} each</small>
                    <span className="customer-stepper">
                      <button onClick={() => change(product, -1)}>
                        <Minus size={13} />
                      </button>
                      <b>{quantity}</b>
                      <button onClick={() => change(product, 1)}>
                        <Plus size={13} />
                      </button>
                    </span>
                  </div>
                  <b>${(product.price * quantity).toFixed(2)}</b>
                </div>
              ))}
            </div>
            <footer>
              <div>
                <span>Requested total</span>
                <strong>${total.toFixed(2)}</strong>
              </div>
              <p>
                Final price is confirmed with our team in Telegram before
                payment.
              </p>
              <button
                className="customer-send"
                disabled={sending || !count}
                onClick={() => submitOrder()}
              >
                <Send size={18} />
                {sending ? 'Sending…' : 'Send Order'}
              </button>
            </footer>
          </aside>
        </>
      )}
      {contactPrompt && (
        <div className="customer-dialog-layer">
          <button
            className="customer-sheet-backdrop"
            onClick={() => setContactPrompt(false)}
          />
          <section className="customer-contact-card">
            <span>
              <Phone size={23} />
            </span>
            <h2>Confirm your order</h2>
            <p>
              Share your phone so we can confirm your order and contact you if
              we need to clarify a cake detail.
            </p>
            <button className="customer-send" onClick={requestPhone}>
              <Phone size={17} /> Share phone
            </button>
            <button
              className="customer-not-now"
              onClick={() => setContactPrompt(false)}
            >
              Not now
            </button>
          </section>
        </div>
      )}
      {error && (
        <div className="customer-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X size={15} />
          </button>
        </div>
      )}
    </main>
  )
}

function productImageStyle(product: Product): CSSProperties {
  return product.imageUrl
    ? {
        backgroundImage: `url(${product.imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { backgroundPosition: product.imagePosition }
}

function OrderStatus({
  order,
  khqrImageUrl,
  onBack,
}: {
  order: CustomerOrder
  khqrImageUrl?: string
  onBack: () => void
}) {
  const { t } = useTranslation()
  const effectiveStatus = order.status === 'Completed' ? 'Ready' : order.status
  const current = Math.max(0, statusSteps.indexOf(effectiveStatus))
  return (
    <main className="customer-order-status">
      <header>
        <button onClick={onBack}>
          <ChevronLeft size={20} />
        </button>
        <div>
          <small>ORDER</small>
          <strong>{order.id}</strong>
        </div>
      </header>
      <section className="status-celebration">
        <span>
          <Check size={28} />
        </span>
        <small>ORDER SENT</small>
        <h1>We’re on it!</h1>
        <p>
          We’ll confirm your final price and any special details with you in
          Telegram.
        </p>
      </section>
      <section className="status-card">
        <div className="status-card-head">
          <div>
            <small>ORDER STATUS</small>
            <strong>{effectiveStatus}</strong>
          </div>
          <span>${order.total.toFixed(2)}</span>
        </div>
        <div className="status-timeline">
          {statusSteps.map((step, index) => (
            <div className={index <= current ? 'done' : ''} key={step}>
              <i>{index < current ? <Check size={12} /> : index + 1}</i>
              <span>
                <strong>{step}</strong>
                <small>
                  {
                    [
                      'We received your request',
                      'Price and details agreed',
                      'Payment confirmed',
                      'Ready for pickup',
                    ][index]
                  }
                </small>
              </span>
            </div>
          ))}
        </div>
      </section>
      {['Confirmed', 'Paid', 'Ready', 'Completed'].includes(order.status) &&
        khqrImageUrl && (
          <section className="customer-khqr">
            <span>PAYMENT</span>
            <h2>Scan to pay with KHQR</h2>
            <img src={khqrImageUrl} alt="Shop KHQR payment code" />
            <p>
              Please wait for the shop to confirm your final price before
              paying.
            </p>
          </section>
        )}
      <button className="status-back" onClick={onBack}>
        Back to today’s menu
      </button>
    </main>
  )
}
