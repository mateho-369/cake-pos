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
  pickupCode?: string | null
}
type OpenOrderItem = {
  productId: number
  name: string
  quantity: number
  price: number
}
const newPlaceKey = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
type MenuResponse = {
  customer: Customer
  products: Product[]
  categories?: string[]
  categoryTree?: Array<{ id: number; name: string; parentId: number | null }>
  khqrImageUrl?: string
  storeOpen?: boolean
}
type Cart = Record<number, number>
const statusSteps = ['Pending', 'Confirmed', 'Paid', 'Ready']
const safeNumber = (value: number | null | undefined) =>
  Number.isFinite(value as number) ? (value as number) : 0
const usd = (value: number | null | undefined) =>
  `$${safeNumber(value).toFixed(2)}`

export default function CustomerApp() {
  const { webApp, initData, botUrl, launchedInTelegram } = useTelegramIdentity()
  const { t } = useTranslation()
  const [menu, setMenu] = useState<MenuResponse | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [activeGallery, setActiveGallery] = useState<Product | null>(null)
  const [cart, setCart] = useState<Cart>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [contactPrompt, setContactPrompt] = useState(false)
  const [order, setOrder] = useState<CustomerOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openOrder, setOpenOrder] = useState<CustomerOrder | null>(null)
  const [cancelling, setCancelling] = useState(false)
  // One idempotency key per placement attempt: a double-tap on "Send Order"
  // sends the same key twice, and the server returns the original order.
  const [placeKey, setPlaceKey] = useState(newPlaceKey)

  useEffect(() => {
    if (!initData) {
      setLoading(false)
      setError(t('errors.telegram'))
      return
    }
    Promise.all([
      apiRequest<MenuResponse>('/api/customer-products', {
        method: 'POST',
        body: JSON.stringify({ initData }),
      }),
      // Reopen the customer's held order (if any) so they keep adding to
      // the SAME order instead of creating a second one.
      apiRequest<{ order: CustomerOrder | null; items: OpenOrderItem[] }>(
        '/api/customer-orders/open',
        { method: 'POST', body: JSON.stringify({ initData }) },
      ).catch(() => ({ order: null, items: [] as OpenOrderItem[] })),
    ])
      .then(([menuResponse, open]) => {
        setMenu(menuResponse)
        if (open.order) {
          setOpenOrder(open.order)
          const restored: Cart = {}
          const stockById = new Map(
            menuResponse.products.map((product) => [product.id, product.stock]),
          )
          for (const item of open.items) {
            const available = stockById.get(item.productId) ?? 0
            if (available > 0) {
              restored[item.productId] = Math.min(item.quantity, available)
            }
          }
          setCart(restored)
        }
      })
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

  const visibleProducts = useMemo(
    () =>
      (menu?.products || []).filter(
        (product) =>
          selectedCategory === 'All' || product.category === selectedCategory,
      ),
    [menu, selectedCategory],
  )
  const categories = useMemo(
    () =>
      menu?.categories || [
        ...new Set((menu?.products || []).map((p) => p.category)),
      ],
    [menu],
  )
  // Grouped nav rows: parents first with their subcategories right after
  // (indented), when the API exposes the hierarchy. Falls back to the flat
  // list on older payloads.
  const categoryNav = useMemo(() => {
    const tree = menu?.categoryTree
    if (!tree?.length) {
      return categories.map((name) => ({ name, child: false }))
    }
    const present = new Set(categories)
    const rows: Array<{ name: string; child: boolean }> = []
    const byId = new Map(tree.map((node) => [node.id, node]))
    const top = tree.filter((node) => !node.parentId)
    const covered = new Set<number>()
    for (const node of top) {
      if (present.has(node.name)) {
        rows.push({ name: node.name, child: false })
      }
      covered.add(node.id)
      for (const child of tree.filter((c) => c.parentId === node.id)) {
        covered.add(child.id)
        if (present.has(child.name)) {
          rows.push({ name: child.name, child: true })
        }
      }
    }
    // Anything not covered by the tree (orphans / legacy) keeps showing.
    for (const node of byId.values()) {
      if (!covered.has(node.id) && present.has(node.name)) {
        rows.push({ name: node.name, child: Boolean(node.parentId) })
      }
    }
    if (rows.length === 0 && categories.length > 0) {
      return categories.map((name) => ({ name, child: false }))
    }
    return rows
  }, [menu?.categoryTree, categories])
  const items = useMemo(
    () =>
      menu?.products
        .filter((product) => cart[product.id])
        .map((product) => ({ product, quantity: cart[product.id] })) || [],
    [menu, cart],
  )
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  // Price may be missing on a legacy/partial product row; a NaN total would
  // be serialized as null and rejected by the backend. Treat unknown prices
  // as 0 so the cart totals/order never throw.
  const total = items.reduce(
    (sum, item) =>
      sum +
      (Number.isFinite(item.product.price as number) ? item.product.price : 0) *
        item.quantity,
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
            idempotencyKey: placeKey,
            items: items.map(({ product, quantity }) => ({
              productId: product.id,
              quantity,
            })),
            requestedTotal: safeNumber(total).toFixed(2),
          }),
        },
      )
      setOrder(result.order)
      setOpenOrder(result.order)
      setCart({})
      setCartOpen(false)
      setPlaceKey(newPlaceKey())
      webApp?.HapticFeedback?.notificationOccurred?.('success')
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : t('errors.send')
      setError(
        /closed|no cashier/i.test(message) ? t('errors.closed') : message,
      )
    } finally {
      setSending(false)
    }
  }

  const cancelOrder = async () => {
    if (
      !order ||
      !['Pending', 'Confirmed', 'Ready'].includes(order.status) ||
      cancelling
    )
      return
    if (!window.confirm(t('status.cancelConfirm'))) return
    setCancelling(true)
    setError(null)
    try {
      const result = await apiRequest<CustomerOrder>(
        `/api/customer-orders/${order.id}/cancel`,
        { method: 'POST', body: JSON.stringify({ initData }) },
      )
      setOrder(result)
      setOpenOrder(null)
      webApp?.HapticFeedback?.notificationOccurred?.('warning')
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t('status.cancelFailed'),
      )
    } finally {
      setCancelling(false)
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
  if (menu.storeOpen === false && !order)
    return (
      <main className="customer-state">
        <span>
          <CakeSlice />
        </span>
        <strong>{t('closed.title')}</strong>
        <p>{t('closed.body')}</p>
      </main>
    )
  if (order)
    return (
      <OrderStatus
        order={order}
        khqrImageUrl={menu.khqrImageUrl}
        onBack={() => setOrder(null)}
        onCancel={cancelOrder}
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
      {openOrder && (
        <section className="customer-open-order">
          <span>
            <ShoppingBag size={15} />
          </span>
          <div>
            <strong>
              {t('menu.openOrderBanner')}{' '}
              <b>{openOrder.pickupCode || openOrder.id}</b>
            </strong>
            <small>{t('menu.openOrderHint')}</small>
          </div>
          <em>{usd(openOrder.total)}</em>
        </section>
      )}
      <section className="customer-menu">
        <div className="customer-section-title">
          <div>
            <span>OUR MENU</span>
            <h2>Fresh from the kitchen</h2>
          </div>
          <small>{visibleProducts.length} treats today</small>
        </div>
        <div className="customer-category-nav">
          {[{ name: 'All', child: false }, ...categoryNav].map(
            ({ name, child }) => (
              <button
                key={name}
                className={`${selectedCategory === name ? 'active' : ''} ${child ? 'subcategory' : ''}`}
                onClick={() => setSelectedCategory(name)}
              >
                {child ? '· ' : ''}
                {name}
              </button>
            ),
          )}
        </div>
        <div className="customer-grid">
          {visibleProducts.map((product) => {
            const quantity = cart[product.id] || 0
            const gallery = productImages(product)
            // Out of stock is a purely derived state: stock <= 0. The card
            // stays visible with a clear label and no way to add it; the
            // moment stock goes back above 0 this disappears on its own.
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
                  style={productImageStyle(product)}
                  onClick={() => {
                    if (gallery.length > 1) setActiveGallery(product)
                    else if (!outOfStock) change(product, 1)
                  }}
                  aria-label={
                    gallery.length > 1
                      ? `View ${product.name} photos`
                      : outOfStock
                        ? `${product.name} — ${t('menu.outOfStock')}`
                        : `Add ${product.name}`
                  }
                >
                  {outOfStock ? (
                    <i className="oos">{t('menu.outOfStock')}</i>
                  ) : (
                    <i>Fresh today</i>
                  )}
                  {gallery.length > 1 && (
                    <em className="photo-count">{gallery.length}</em>
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
                      <span className="customer-oos-note">
                        {t('menu.outOfStock')}
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
      {activeGallery && (
        <div className="customer-gallery-layer">
          <button
            className="customer-sheet-backdrop"
            onClick={() => setActiveGallery(null)}
            aria-label="Close gallery"
          />
          <section className="customer-gallery-sheet">
            <i />
            <header>
              <div>
                <small>{activeGallery.category}</small>
                <h2>{activeGallery.name}</h2>
              </div>
              <button onClick={() => setActiveGallery(null)}>
                <X size={19} />
              </button>
            </header>
            <div className="customer-gallery-scroll">
              {productImages(activeGallery).map((image, index) => (
                <figure key={`${image.url}-${index}`}>
                  <img
                    src={image.url}
                    alt={image.caption || activeGallery.name}
                  />
                  {image.caption && <figcaption>{image.caption}</figcaption>}
                </figure>
              ))}
            </div>
            <footer>
              <span>{usd(activeGallery.price)}</span>
              <button
                className="customer-send"
                disabled={activeGallery.stock <= 0}
                onClick={() => {
                  if (activeGallery.stock <= 0) return
                  change(activeGallery, 1)
                  setActiveGallery(null)
                }}
              >
                {activeGallery.stock <= 0 ? (
                  t('menu.outOfStock')
                ) : (
                  <>
                    <Plus size={17} /> Add to order
                  </>
                )}
              </button>
            </footer>
          </section>
        </div>
      )}
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
                    style={productImageStyle(product)}
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
                <strong>{usd(total)}</strong>
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

function productImages(product: Product) {
  return product.images && product.images.length
    ? product.images
    : product.imageUrl
      ? [{ url: product.imageUrl, caption: '' }]
      : []
}

function productImageStyle(product: Product): CSSProperties {
  const first = productImages(product)[0]
  return first?.url
    ? {
        backgroundImage: `url(${first.url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { backgroundPosition: product.imagePosition }
}

function OrderStatus({
  order,
  khqrImageUrl,
  onBack,
  onCancel,
  cancelling,
}: {
  order: CustomerOrder
  khqrImageUrl?: string
  onBack: () => void
  onCancel: () => void
  cancelling: boolean
}) {
  const { t } = useTranslation()
  const effectiveStatus = order.status === 'Completed' ? 'Ready' : order.status
  const current = Math.max(0, statusSteps.indexOf(effectiveStatus))
  const cancellable = ['Pending', 'Confirmed', 'Ready'].includes(order.status)
  if (order.status === 'Cancelled')
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
          <small>{t('status.cancelled')}</small>
          <h1>{t('status.cancelTitle')}</h1>
          <p>{t('status.cancelBody')}</p>
        </section>
        <button className="status-back" onClick={onBack}>
          {t('status.back')}
        </button>
      </main>
    )
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
        <h1>{t('status.title')}</h1>
        <p>{t('status.body')}</p>
        {order.pickupCode && (
          <div className="status-pickup-code">
            <small>{t('menu.pickupCodeLabel')}</small>
            <strong>{order.pickupCode}</strong>
            <span>{t('menu.pickupCodeHint')}</span>
          </div>
        )}
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
                      t('status.pending'),
                      t('status.confirmed'),
                      t('status.paid'),
                      t('status.ready'),
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
            <span>{t('status.payment')}</span>
            <h2>{t('status.scan')}</h2>
            <img src={khqrImageUrl} alt="Shop KHQR payment code" />
            <p>{t('status.wait')}</p>
          </section>
        )}
      {cancellable && (
        <button
          className="status-cancel"
          disabled={cancelling}
          onClick={onCancel}
        >
          {cancelling ? '…' : t('status.cancel')}
        </button>
      )}
      <button className="status-back" onClick={onBack}>
        {t('status.back')}
      </button>
    </main>
  )
}
