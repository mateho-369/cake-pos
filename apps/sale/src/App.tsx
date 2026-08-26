import { useEffect, useMemo, useState } from 'react'
import { Clock3, Plus, ShoppingBag, X } from 'lucide-react'
import { useStaffAuth } from './auth/StaffAuthContext'
import LoginScreen from './components/LoginScreen'
import TerminalHeader from './components/TerminalHeader'
import ProductGrid from './components/ProductGrid'
import CartPanel, { type PaymentMethod } from './components/CartPanel'
import ShiftModal from './components/ShiftModal'
import QuickAddModal from './components/QuickAddModal'
import SuccessOverlay from './components/SuccessOverlay'
import OrderHistoryModal from './components/OrderHistoryModal'
import { type CartItem, type Product } from './data'
import { useTranslation } from './lib/i18n'
import { useSaleData } from './lib/data'
import CustomerApp from './CustomerApp'
import CustomerDisplay from './components/CustomerDisplay'

type Shift = { startedAt: string; openingCash: number }
type Success = { total: number; method: PaymentMethod; orderId: string }
export default function App() {
  const { token } = useStaffAuth()
  if (window.location.pathname.replace(/\/$/, '') === '/customer-display')
    return <CustomerDisplay />
  if (window.location.pathname.replace(/\/$/, '') === '/customer')
    return <CustomerApp />
  const [isTelegram, setIsTelegram] = useState(false)
  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (!webApp) return
    webApp.ready()
    webApp.expand()
    webApp.setHeaderColor?.('#FDF2F6')
    webApp.setBackgroundColor?.('#FDF2F6')
    setIsTelegram(true)
  }, [])
  return (
    <div className={isTelegram ? 'telegram-app' : ''}>
      {token ? <SaleTerminal /> : <LoginScreen />}
    </div>
  )
}
function SaleTerminal() {
  const { t } = useTranslation()
  const { employee } = useStaffAuth()
  const {
    products,
    orders,
    nextOrderNumber,
    defaultShelfLifeDays,
    createProduct,
    createOrder,
    currentShift,
    openShift,
    closeShift,
  } = useSaleData()
  const [cart, setCart] = useState<CartItem[]>([])
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [payment, setPayment] = useState<PaymentMethod>('cash')
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>(
    'percentage',
  )
  const [discountValue, setDiscountValue] = useState('')
  const [checkoutKey, setCheckoutKey] = useState(() => newCheckoutKey())
  const [tendered, setTendered] = useState('')
  const [khqrConfirmed, setKhqrConfirmed] = useState(false)
  const [shift, setShift] = useState<Shift | null>(null)
  const [shiftModal, setShiftModal] = useState(false)
  const [shiftMode, setShiftMode] = useState<'open' | 'close'>('open')
  const [cashSales, setCashSales] = useState(0)
  const [quickAdd, setQuickAdd] = useState(false)
  const [mobileCart, setMobileCart] = useState(false)
  const [success, setSuccess] = useState<Success | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const openCustomerDisplay = (autoPlace = false) => {
    const features = autoPlace ? undefined : 'popup,width=700,height=900'
    if (autoPlace && 'getScreenDetails' in window) {
      void (
        window as Window & {
          getScreenDetails?: () => Promise<{
            screens: Array<{
              availLeft: number
              availTop: number
              availWidth: number
              availHeight: number
            }>
          }>
        }
      )
        .getScreenDetails?.()
        .then((details) => {
          const screens = details?.screens as
            | Array<{
                availLeft: number
                availTop: number
                availWidth: number
                availHeight: number
              }>
            | undefined
          const screen = screens?.find(
            (candidate) =>
              !(
                window.screenX >= candidate.availLeft &&
                window.screenX < candidate.availLeft + candidate.availWidth &&
                window.screenY >= candidate.availTop &&
                window.screenY < candidate.availTop + candidate.availHeight
              ),
          )
          const options = screen
            ? `popup,width=${Math.min(800, screen.availWidth)},height=${screen.availHeight},left=${screen.availLeft},top=${screen.availTop}`
            : features
          window.open(
            '/customer-display',
            'cake-pos-customer-display',
            options || undefined,
          )
        })
        .catch(() =>
          window.open(
            '/customer-display',
            'cake-pos-customer-display',
            'popup,width=700,height=900',
          ),
        )
      return
    }
    window.open('/customer-display', 'cake-pos-customer-display', features)
  }
  const subtotal = useMemo(
    () =>
      cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cart],
  )
  const requestedDiscount = Math.max(0, Number(discountValue || 0))
  const discountAmount = Math.min(
    subtotal,
    discountType === 'percentage'
      ? (subtotal * Math.min(100, requestedDiscount)) / 100
      : requestedDiscount,
  )
  const cartTotal = Math.max(0, subtotal - discountAmount)
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  // The shift is owned server-side. Hydrate it after any login/session return
  // so a shift that is still open survives logout/login and only closes when a
  // user explicitly closes it. `currentShift` is `undefined` until the first
  // fetch completes, so we never show the open-shift gate prematurely.
  useEffect(() => {
    if (currentShift === undefined) return
    if (currentShift) {
      setShift({
        openingCash: currentShift.openingCash,
        startedAt:
          currentShift.startedAt ||
          new Intl.DateTimeFormat('en', {
            hour: 'numeric',
            minute: '2-digit',
          }).format(new Date(currentShift.openedAt || Date.now())),
      })
      setShiftModal(false)
    } else {
      setShift(null)
      setShiftModal(true)
    }
  }, [currentShift])
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return
    const channel = new BroadcastChannel('cake-pos-cart')
    channel.postMessage({
      cart,
      subtotal,
      total: cartTotal,
      paymentState: success ? 'success' : 'idle',
      orderId: success?.orderId,
    })
    return () => channel.close()
  }, [cart, subtotal, cartTotal, success])
  const expectedCash = (shift?.openingCash || 0) + cashSales
  const visibleProducts = useMemo(
    () =>
      products
        .filter((product) => {
          const matchesCategory =
            category === 'All' || product.category === category
          const matchesQuery = `${product.name} ${product.category}`
            .toLowerCase()
            .includes(query.toLowerCase())
          return matchesCategory && matchesQuery && product.stock > 0
        })
        .sort((a, b) => freshnessPriority(a) - freshnessPriority(b)),
    [products, category, query],
  )
  useEffect(() => {
    if (!success) return
    const timeout = window.setTimeout(() => setSuccess(null), 8000)
    return () => window.clearTimeout(timeout)
  }, [success])
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])
  const addToCart = (product: Product) => {
    if (!shift) {
      setShiftMode('open')
      setShiftModal(true)
      return
    }
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id)
      if (existing)
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: Math.min(product.stock, item.quantity + 1) }
            : item,
        )
      return [...current, { product, quantity: 1 }]
    })
  }
  const changeQuantity = (productId: number, delta: number) =>
    setCart((current) =>
      current
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity + delta }
            : item,
        )
        .filter((item) => item.quantity > 0),
    )
  const changePayment = (method: PaymentMethod) => {
    setPayment(method)
    if (method === 'cash') setKhqrConfirmed(false)
    else setTendered('')
  }
  const completePayment = async () => {
    try {
      const order = await createOrder({
        payment: payment === 'cash' ? 'Cash' : 'KHQR',
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
        ...(discountValue
          ? { discount: { type: discountType, amount: discountValue } }
          : {}),
        idempotencyKey: checkoutKey,
        confirmed: payment === 'khqr' ? khqrConfirmed : undefined,
        ...(payment === 'cash' && tendered
          ? { usdReceivedCents: Math.round(Number(tendered) * 100) }
          : {}),
      })
      setSuccess({ total: order.total, method: payment, orderId: order.id })
      setCart([])
      setTendered('')
      setDiscountValue('')
      setCheckoutKey(newCheckoutKey())
      setKhqrConfirmed(false)
      setPayment('cash')
      setMobileCart(false)
      if (payment === 'cash') setCashSales((current) => current + order.total)
    } catch (reason) {
      setToast(
        reason instanceof Error ? reason.message : t('sale.paymentFailed'),
      )
    }
  }
  const openShiftAction = () => {
    if (shift && cart.length) {
      setToast(t('sale.completeOrderFirst'))
      return
    }
    setShiftMode(shift ? 'close' : 'open')
    setShiftModal(true)
  }
  const confirmShift = async (amount: number) => {
    try {
      if (shiftMode === 'open') {
        const result = await openShift(amount)
        setShift({
          openingCash: result.openingCash,
          startedAt:
            result.startedAt ||
            new Intl.DateTimeFormat('en', {
              hour: 'numeric',
              minute: '2-digit',
            }).format(new Date()),
        })
        setToast(t('sale.shiftOpenedWith', { amount: amount.toFixed(2) }))
      } else {
        const result = await closeShift(amount)
        setShift(null)
        setCashSales(0)
        setToast(
          Math.abs(result.variance) < 0.01
            ? t('sale.shiftClosedBalanced')
            : t('sale.shiftClosedVariance', {
                sign: result.variance > 0 ? '+' : '−',
                amount: Math.abs(result.variance).toFixed(2),
              }),
        )
      }
      setShiftModal(false)
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : t('sale.shiftFailed'))
    }
  }
  const addQuickProduct = async (product: Product) => {
    try {
      await createProduct({
        name: product.name,
        category: product.category,
        price: product.price,
        stock: product.stock,
        bestBefore: product.bestBefore,
        imagePosition: product.imagePosition,
        imageUrl: product.imageUrl,
      })
      setQuickAdd(false)
      setCategory('All')
      setToast(t('sale.productPublished', { name: product.name }))
    } catch (reason) {
      setToast(
        reason instanceof Error ? reason.message : t('sale.productFailed'),
      )
    }
  }
  return (
    <main className="sale-terminal">
      <TerminalHeader
        shiftOpen={Boolean(shift)}
        shiftStartedAt={shift?.startedAt}
        onShift={openShiftAction}
        query={query}
        onQuery={setQuery}
        cartCount={cartCount}
        onCart={() => setMobileCart(true)}
        onHistory={() => setHistoryOpen(true)}
        onCustomerDisplay={() => openCustomerDisplay()}
        onAutoPlaceDisplay={() => openCustomerDisplay(true)}
      />
      {!shift && (
        <button className="shift-gate-banner" onClick={openShiftAction}>
          <span>
            <Clock3 size={17} />
          </span>
          <div>
            <strong>{t('sale.shiftGate')}</strong>
            <small>{t('sale.countDrawer')}</small>
          </div>
          <b>{t('sale.openShift')}</b>
        </button>
      )}
      <div className="terminal-layout">
        <ProductGrid
          products={visibleProducts}
          category={category}
          onCategory={setCategory}
          onAdd={addToCart}
          cart={cart}
          query={query}
          onQuery={setQuery}
        />
        <CartPanel
          orderNumber={nextOrderNumber}
          cart={cart}
          subtotal={subtotal}
          onQuantity={changeQuantity}
          onRemove={(id) =>
            setCart((current) =>
              current.filter((item) => item.product.id !== id),
            )
          }
          onClear={() => {
            setCart([])
            setDiscountValue('')
            setCheckoutKey(newCheckoutKey())
          }}
          discountType={discountType}
          discountValue={discountValue}
          onDiscountType={setDiscountType}
          onDiscountValue={setDiscountValue}
          payment={payment}
          onPayment={changePayment}
          tendered={tendered}
          onTendered={setTendered}
          khqrConfirmed={khqrConfirmed}
          onKhqrConfirmed={setKhqrConfirmed}
          onComplete={completePayment}
          shiftOpen={Boolean(shift)}
          mobileOpen={mobileCart}
          onMobileClose={() => setMobileCart(false)}
        />
      </div>
      <button
        className="quick-add-fab"
        onClick={() => setQuickAdd(true)}
        aria-label={t('sale.quickAddCake')}
      >
        <Plus size={25} />
        <span>{t('sale.quickAdd')}</span>
      </button>
      {cartCount > 0 && (
        <button
          className="mobile-cart-dock"
          onClick={() => setMobileCart(true)}
        >
          <span>
            <ShoppingBag size={18} />
            <i>{cartCount}</i>
            <b>{t('sale.viewOrder')}</b>
          </span>
          <strong>${cartTotal.toFixed(2)}</strong>
        </button>
      )}
      {mobileCart && (
        <button
          className="mobile-cart-backdrop"
          aria-label={t('sale.closeCart')}
          onClick={() => setMobileCart(false)}
        />
      )}
      <ShiftModal
        open={shiftModal}
        mode={shiftMode}
        expectedCash={expectedCash}
        openingCash={shift?.openingCash || 0}
        cashSales={cashSales}
        employeeName={employee?.name || ''}
        shiftStartedAt={shift?.startedAt}
        onClose={() => setShiftModal(false)}
        onConfirm={confirmShift}
      />
      <QuickAddModal
        open={quickAdd}
        onClose={() => setQuickAdd(false)}
        onAdd={addQuickProduct}
        shelfLifeDays={defaultShelfLifeDays}
      />
      <OrderHistoryModal
        open={historyOpen}
        orders={orders.filter((order) => order.source === 'walk-in')}
        onClose={() => setHistoryOpen(false)}
        onError={setToast}
      />
      {success && (
        <SuccessOverlay
          total={success.total}
          method={success.method}
          orderId={success.orderId}
          onError={setToast}
        />
      )}
      {toast && (
        <div className="sale-toast">
          <span>{toast}</span>
          <button
            onClick={() => setToast(null)}
            aria-label={t('sale.toastClose')}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </main>
  )
}
function newCheckoutKey() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const value = (Math.random() * 16) | 0
      return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16)
    })
  )
}
function freshnessPriority(product: Product) {
  return product.freshness === 'today'
    ? 0
    : product.freshness === 'tomorrow'
      ? 1
      : 2
}
