import { useEffect, useMemo, useState } from 'react'
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
import { useTelegramChrome } from '@cake-pos/telegram/react'
import type { Product } from './data'
// A missing price on a legacy/partial product row must render as $0.00
// instead of breaking the customer's Mini App with `toFixed is not a
// function`. The backend refuses to save a product without a price, but the
// storefront must survive a bad payload.
const safeNumber = (value: number | null | undefined) =>
  Number.isFinite(value as number) ? (value as number) : 0
const usd = (value: number | null | undefined) =>
  `$${safeNumber(value).toFixed(2)}`

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
  storeOpen?: boolean
}
type Cart = Record<number, number>
const statusSteps = ['Pending', 'Confirmed', 'Paid', 'Ready']

export default function CustomerApp() {
  const webApp = window.Telegram?.WebApp
  const initData =
    webApp?.initData || import.meta.env.VITE_DEV_TELEGRAM_INIT_DATA || ''
  const [menu, setMenu] = useState<MenuResponse | null>(null)
  const [cart, setCart] = useState<Cart>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [contactPrompt, setContactPrompt] = useState(false)
  const [order, setOrder] = useState<CustomerOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Same edge-to-edge behaviour as the shop Mini App (ready → expand →
  // fullscreen with one retry after the first user gesture).
  useTelegramChrome()

  useEffect(() => {
    if (!initData) {
      setLoading(false)
      setError(
        'Open this storefront from the shop’s Telegram bot to browse and order.',
      )
      return
    }
    apiRequest<MenuResponse>('/api/customer-products', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    })
      .then(setMenu)
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : 'Could not load today’s menu',
        ),
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
    (sum, item) => sum + safeNumber(item.product.price) * item.quantity,
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
    throw new Error(
      'We have not received your phone yet. Please try Share phone again.',
    )
  }
  const requestPhone = async () => {
    setContactPrompt(false)
    setSending(true)
    setError(null)
    try {
      if (!webApp?.requestContact)
        throw new Error('Phone sharing is only available inside Telegram.')
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
      const message =
        reason instanceof Error ? reason.message : 'Could not send your order'
      setError(
        /closed|no cashier/i.test(message)
          ? 'The shop is closed until a cashier opens a shift. Please try again later.'
          : message,
      )
    } finally {
      setSending(false)
    }
  }
  const cancelOrder = async () => {
    if (!order) return
    setCancelling(true)
    setError(null)
    try {
      await apiRequest(`/api/customer-orders/${order.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ initData }),
      })
      setOrder({ ...order, status: 'Cancelled' })
      webApp?.HapticFeedback?.notificationOccurred?.('warning')
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : 'We could not cancel your order'
      setError(
        /accept|already/i.test(message)
          ? 'Your order has already been accepted. Please contact the shop in Telegram if you need to change it.'
          : message,
      )
    } finally {
      setCancelling(false)
    }
  }

  if (loading)
    return (
      <main className="customer-state">
        <span className="customer-loader">
          <CakeSlice />
        </span>
        <strong>Preparing today’s menu…</strong>
      </main>
    )
  if (!menu)
    return (
      <main className="customer-state">
        <span>
          <CakeSlice />
        </span>
        <strong>Storefront unavailable</strong>
        <p>{error}</p>
      </main>
    )
  if (menu.storeOpen === false && !order)
    return (
      <main className="customer-state">
        <span>
          <CakeSlice />
        </span>
        <strong>We're closed right now</strong>
        <p>
          The shop is closed until a cashier opens a shift. Please try again
          later.
        </p>
      </main>
    )
  if (order)
    return (
      <OrderStatus
        order={order}
        khqrImageUrl={menu.khqrImageUrl}
        onBack={() => setOrder(null)}
        onCancel={() => void cancelOrder()}
        cancelling={cancelling}
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
        <div className="customer-greeting">
          <small>Welcome</small>
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
            // Derived out-of-stock state: stays visible with a label and no
            // add button until stock goes back above 0.
            const outOfStock = product.stock <= 0
            return (
              <article
                className={`customer-product ${quantity ? 'selected' : ''} ${
                  outOfStock ? 'out-of-stock' : ''
                }`}
                key={product.id}
              >
                <button
                  className="customer-product-photo"
                  style={{ backgroundPosition: product.imagePosition }}
                  onClick={() => {
                    if (!outOfStock) change(product, 1)
                  }}
                  aria-label={
                    outOfStock
                      ? `${product.name} — Out of stock`
                      : `Add ${product.name}`
                  }
                >
                  {outOfStock ? (
                    <i className="oos">Out of stock</i>
                  ) : (
                    <i>Fresh today</i>
                  )}
                  {quantity > 0 && <b>{quantity}</b>}
                </button>
                <div className="customer-product-copy">
                  <small>{product.category}</small>
                  <strong>{product.name}</strong>
                  <div>
                    <span>{usd(product.price)}</span>
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
                    ) : outOfStock ? (
                      <span className="customer-oos-note">Out of stock</span>
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
          <em>{usd(total)}</em>
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
                    style={{ backgroundPosition: product.imagePosition }}
                  />
                  <div>
                    <strong>{product.name}</strong>
                    <small>{usd(product.price)} each</small>
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
                  <b>{usd(safeNumber(product.price) * quantity)}</b>
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

function OrderStatus({
  order,
  khqrImageUrl,
  onBack,
  onCancel,
  cancelling = false,
}: {
  order: CustomerOrder
  khqrImageUrl?: string
  onBack: () => void
  onCancel?: () => void
  cancelling?: boolean
}) {
  const effectiveStatus = order.status === 'Completed' ? 'Ready' : order.status
  const current = Math.max(0, statusSteps.indexOf(effectiveStatus))
  if (order.status === 'Cancelled') {
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
        <section className="status-celebration cancelled">
          <span>
            <X size={28} />
          </span>
          <small>ORDER CANCELLED</small>
          <h1>Your order was cancelled</h1>
          <p>
            You cancelled this order before the shop accepted it. If you
            still want it, place a new order.
          </p>
        </section>
        <button className="status-back" onClick={onBack}>
          Back to today’s menu
        </button>
      </main>
    )
  }
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
          <span>{usd(order.total)}</span>
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
        {['Pending', 'Confirmed', 'Ready'].includes(order.status) &&
          onCancel && (
          <button
            className="status-cancel"
            onClick={onCancel}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelling…' : 'Cancel order'}
          </button>
        )}
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
