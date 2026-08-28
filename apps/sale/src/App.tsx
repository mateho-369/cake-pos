import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
import PendingOrdersPanel from './components/PendingOrdersPanel'
import HeldOrdersPanel from './components/HeldOrdersPanel'
import { type CartItem, type HeldOrder, type Product } from './data'
import { useTranslation } from './lib/i18n'
import { apiRequest } from './lib/api'
import { useSaleData } from './lib/data'
import { useTelegramChrome } from '@cake-pos/telegram/react'
import CustomerApp from './CustomerApp'
import CustomerDisplay from './components/CustomerDisplay'

type Shift = {
  startedAt: string
  openingCash: number
  openingCashKhr?: number
  expectedCashKhr?: number
}
type Success = { total: number; method: PaymentMethod; orderId: string }
type PendingSaleAction =
  { type: 'add'; product: Product } | { type: 'checkout' } | null
export default function App() {
  const { token } = useStaffAuth()
  if (window.location.pathname.replace(/\/$/, '') === '/customer-display')
    return <CustomerDisplay />
  if (window.location.pathname.replace(/\/$/, '') === '/customer')
    return <CustomerApp />
  // The staff terminal is itself a Telegram Mini App: it must open
  // edge-to-edge exactly like the customer storefront, not just expanded.
  const { inTelegram } = useTelegramChrome()
  return (
    <div className={inTelegram ? 'telegram-app' : ''}>
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
    exchangeRateKhrPerUsd,
    createProduct,
    createOrder,
    currentShift,
    openShift,
    closeShift,
    refresh,
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
  const [tenderedKhr, setTenderedKhr] = useState('')
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
  // A sale action that was blocked because no shift is open. Once the
  // cashier opens a shift through the prompt, the action continues
  // automatically instead of forcing them to click again.
  const [pendingAction, setPendingAction] = useState<PendingSaleAction>(null)
  // Held ("parked") orders and the holds the current cart was resumed from.
  const [held, setHeld] = useState<HeldOrder[]>([])
  const [heldBusy, setHeldBusy] = useState(false)
  const [resumedFrom, setResumedFrom] = useState<string[]>([])
  const promptOpenShift = (action: PendingSaleAction) => {
    setPendingAction(action)
    setShiftMode('open')
    setShiftModal(true)
  }
  // Generic "a shift must be open first" gate used by the pending-orders
  // panel: run the action now when a shift is open, otherwise open the
  // shift prompt and run it right after.
  const [shiftResume, setShiftResume] = useState<(() => void) | null>(null)
  const requestShiftThen = (resume: () => void) => {
    if (shift) {
      resume()
      return
    }
    setShiftResume(() => resume)
    setShiftMode('open')
    setShiftModal(true)
  }
  const payPendingOrder = async (
    orderId: string,
    method: 'Cash' | 'KHQR',
    usdReceivedCents: number,
  ) => {
    await apiRequest(`/api/orders/${orderId}/pay`, {
      method: 'POST',
      body: JSON.stringify(
        method === 'Cash'
          ? { method: 'Cash', usdReceivedCents }
          : { method: 'KHQR', confirmed: true },
      ),
    })
    await refresh()
  }
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
  // so a shift that is still open survives logout/login and only closes when
  // a user explicitly closes it. `currentShift` is `undefined` until the
  // first fetch completes. Login itself never opens or prompts for a shift —
  // a cashier can browse the catalog freely; the open-shift prompt only
  // appears when they actually try to make a sale (see addToCart /
  // completePayment below) or click the shift banner/header button.
  // The data context polls /api/shifts/current every 15s, so a shift closed
  // or opened on ANOTHER terminal reflects here too. The modal is only
  // dismissed on a real open↔closed TRANSITION — never while the cashier is
  // mid-typing into an unchanged open shift.
  const hydratedShiftState = useRef<boolean | null>(null)
  useEffect(() => {
    if (currentShift === undefined) return
    const liveShift = currentShift
    const nowOpen = Boolean(liveShift)
    const previous = hydratedShiftState.current
    hydratedShiftState.current = nowOpen
    if (liveShift) {
      setShift({
        openingCash: liveShift.openingCash,
        openingCashKhr: liveShift.openingCashKhr ?? 0,
        expectedCashKhr: liveShift.expectedCashKhr ?? 0,
        startedAt:
          liveShift.startedAt ||
          new Intl.DateTimeFormat('en', {
            hour: 'numeric',
            minute: '2-digit',
          }).format(new Date(liveShift.openedAt || Date.now())),
      })
    } else {
      setShift(null)
    }
    if (previous !== null && previous !== nowOpen) {
      setShiftModal(false)
      setPendingAction(null)
      setShiftResume(null)
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
  const pushToCart = (product: Product) =>
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
  const addToCart = (product: Product) => {
    // Starting an order is a sale action: it needs an open shift. Prompt
    // with the existing open-shift flow and add the product automatically
    // once the shift is open.
    if (!shift) {
      promptOpenShift({ type: 'add', product })
      return
    }
    pushToCart(product)
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
    else {
      setTendered('')
      setTenderedKhr('')
    }
  }
  const completePayment = async () => {
    if (!shift) {
      promptOpenShift({ type: 'checkout' })
      return
    }
    try {
      // Mixed-currency split tender: both fields are independent; the
      // server validates the combined value covers the total and records
      // cash_usd_cents and cash_khr as two distinct per-currency values
      // (never blended), so the shift drawer reconciles per currency.
      const usdCents = Math.round(Math.max(0, Number(tendered || 0)) * 100)
      const khrReceived = Math.max(
        0,
        Math.round(Number(tenderedKhr.replace(/[^0-9.]/g, '') || 0)),
      )
      const rate = exchangeRateKhrPerUsd
      const totalCents = Math.round(cartTotal * 100)
      const changeCentRiel = Math.max(
        0,
        usdCents * rate + khrReceived * 100 - totalCents * rate,
      )
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
        // Holds resumed into this cart stop being held the moment the sale is
        // paid (server-side, in the same transaction).
        ...(resumedFrom.length ? { heldOrderIds: resumedFrom } : {}),
        ...(payment === 'cash'
          ? {
              usdReceivedCents: usdCents,
              khrReceived,
              // Change is handed back in USD by default; the ៛ figure shown
              // in the panel is the equivalent (rounded to ៛100) display.
              changeUsdCents: Math.round(changeCentRiel / rate / 100),
              changeKhr: 0,
              exchangeRateKhrPerUsd: rate,
            }
          : {}),
      })
      setSuccess({ total: order.total, method: payment, orderId: order.id })
      setCart([])
      setTendered('')
      setTenderedKhr('')
      setDiscountValue('')
      setCheckoutKey(newCheckoutKey())
      setKhqrConfirmed(false)
      setPayment('cash')
      setMobileCart(false)
      setResumedFrom([])
      if (resumedFrom.length) void loadHeld()
      if (payment === 'cash') setCashSales((current) => current + order.total)
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : t('sale.paymentFailed')
      // The backend enforces the shift gate too (409 + requires_open_shift).
      // If the shift disappeared underneath us (e.g. closed on another
      // terminal), re-prompt instead of just showing a toast.
      if (!shift || message.toLowerCase().includes('no open shift')) {
        promptOpenShift({ type: 'checkout' })
      }
      setToast(message)
    }
  }
  const loadHeld = useCallback(async () => {
    try {
      const next = await apiRequest<HeldOrder[]>('/api/orders/held')
      setHeld(next.filter((order) => order.status === 'Held'))
    } catch {
      /* offline / logged out — the next poll picks it up */
    }
  }, [])
  useEffect(() => {
    void loadHeld()
    const timer = window.setInterval(() => void loadHeld(), 15_000)
    return () => window.clearInterval(timer)
  }, [loadHeld])

  /** Park the cart: the customer pays when they come back. */
  const holdCart = async (label: string) => {
    if (!cart.length) return
    if (!shift) {
      promptOpenShift({ type: 'checkout' })
      return
    }
    setHeldBusy(true)
    try {
      const order = await apiRequest<HeldOrder>('/api/orders/hold', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
          ...(discountValue
            ? { discount: { type: discountType, amount: discountValue } }
            : {}),
          ...(label ? { holdLabel: label } : {}),
        }),
      })
      setCart([])
      setDiscountValue('')
      setTendered('')
      setTenderedKhr('')
      setPayment('cash')
      setKhqrConfirmed(false)
      setCheckoutKey(newCheckoutKey())
      setMobileCart(false)
      setToast(t('hold.held', { id: order.holdLabel || order.id }))
      await Promise.all([loadHeld(), refresh()])
    } catch (reason) {
      setToast(
        reason instanceof Error ? reason.message : t('sale.paymentFailed'),
      )
    } finally {
      setHeldBusy(false)
    }
  }

  /**
   * Put a held order's lines back into the cart. The hold itself stays put
   * until the sale is paid, so nothing is lost if the customer changes their
   * mind or the cart is cleared.
   */
  const resumeHold = (order: HeldOrder) => {
    // Look the products up in the FULL catalogue, not the filtered grid: a
    // hold has to be resumable even while the cashier is searching.
    let missing = 0
    for (const line of order.lineItems ?? []) {
      const product =
        (line.productId != null &&
          products.find((candidate) => candidate.id === line.productId)) ||
        undefined
      if (!product) {
        missing += 1
        continue
      }
      setCart((current) => {
        const existing = current.find(
          (item) => item.product.id === product.id,
        )
        if (existing) {
          return current.map((item) =>
            item.product.id === product.id
              ? { ...item, quantity: item.quantity + line.quantity }
              : item,
          )
        }
        return [...current, { product, quantity: line.quantity }]
      })
    }
    setResumedFrom((current) =>
      current.includes(order.id) ? current : [...current, order.id],
    )
    setMobileCart(true)
    setToast(
      missing
        ? t('hold.resumedPartial', { id: order.holdLabel || order.id })
        : t('hold.resumed', { id: order.holdLabel || order.id }),
    )
  }

  /** Take payment for a held order without putting it back in the cart. */
  const payHold = async (
    order: HeldOrder,
    method: 'Cash' | 'KHQR',
    usdReceivedCents: number,
  ) => {
    if (!shift) {
      promptOpenShift({ type: 'checkout' })
      return
    }
    setHeldBusy(true)
    try {
      await apiRequest(`/api/orders/${order.id}/pay`, {
        method: 'POST',
        body: JSON.stringify(
          method === 'Cash'
            ? {
                method: 'Cash',
                usdReceivedCents,
                changeUsdCents: 0,
                changeKhr: 0,
                exchangeRateKhrPerUsd,
              }
            : { method: 'KHQR', confirmed: true },
        ),
      })
      setToast(t('hold.paid', { id: order.holdLabel || order.id }))
      await Promise.all([loadHeld(), refresh()])
    } catch (reason) {
      setToast(
        reason instanceof Error ? reason.message : t('sale.paymentFailed'),
      )
    } finally {
      setHeldBusy(false)
    }
  }

  /** Discard a hold and give its reserved stock back. */
  const voidHold = async (order: HeldOrder) => {
    setHeldBusy(true)
    try {
      await apiRequest(`/api/orders/${order.id}/cancel`, { method: 'POST' })
      setResumedFrom((current) => current.filter((id) => id !== order.id))
      setToast(t('hold.voided', { id: order.holdLabel || order.id }))
      await Promise.all([loadHeld(), refresh()])
    } catch (reason) {
      setToast(
        reason instanceof Error ? reason.message : t('sale.paymentFailed'),
      )
    } finally {
      setHeldBusy(false)
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
  const confirmShift = async (amount: number, amountKhr = 0) => {
    try {
      if (shiftMode === 'open') {
        const result = await openShift(amount, amountKhr)
        setShift({
          openingCash: result.openingCash,
          openingCashKhr: result.openingCashKhr ?? 0,
          expectedCashKhr: result.expectedCashKhr ?? 0,
          startedAt:
            result.startedAt ||
            new Intl.DateTimeFormat('en', {
              hour: 'numeric',
              minute: '2-digit',
            }).format(new Date()),
        })
        setToast(
          t('sale.shiftOpenedWith', { amount: amount.toFixed(2) }) +
            (amountKhr ? ` · ៛${amountKhr.toLocaleString()}` : ''),
        )
        // Run the sale action that was waiting on the shift (e.g. taking
        // payment for a held customer order).
        if (shiftResume) {
          const resume = shiftResume
          setShiftResume(null)
          resume()
        }
      } else {
        const result = await closeShift(amount, amountKhr)
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
      const message =
        reason instanceof Error ? reason.message : t('sale.shiftFailed')
      // Another terminal opened the store shift in the meantime: our open
      // attempt is refused, but a shift DOES exist — re-sync from the
      // server so this terminal picks it up (and any pending sale resumes).
      if (message.toLowerCase().includes('already open')) {
        void refresh()
      }
      setToast(message)
    }
  }
  // Once a shift is open (whether via the prompted modal or the header
  // button), resume the sale action that was blocked on it — the cashier
  // should not have to click twice.
  useEffect(() => {
    if (!shift || !pendingAction) return
    if (pendingAction.type === 'add') {
      pushToCart(pendingAction.product)
      setPendingAction(null)
    } else {
      setPendingAction(null)
      void completePayment()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift, pendingAction])
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
      <PendingOrdersPanel
        shiftOpen={Boolean(shift)}
        onPay={payPendingOrder}
        onNeedShift={requestShiftThen}
        onToast={setToast}
      />
      <HeldOrdersPanel
        held={held}
        busy={heldBusy}
        onResume={resumeHold}
        onPay={payHold}
        onVoid={voidHold}
      />
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
          tenderedKhr={tenderedKhr}
          onTenderedKhr={setTenderedKhr}
          rate={exchangeRateKhrPerUsd}
          khqrConfirmed={khqrConfirmed}
          onKhqrConfirmed={setKhqrConfirmed}
          onComplete={completePayment}
          onHold={holdCart}
          holdBusy={heldBusy}
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
        expectedCashKhr={
          // Authoritative per-currency expected drawer from the server
          // (opening ៛ + net ៛ cash sales), kept live by the shift poll.
          currentShift?.expectedCashKhr ?? shift?.openingCashKhr ?? 0
        }
        openingCash={shift?.openingCash || 0}
        openingCashKhr={shift?.openingCashKhr || 0}
        cashSales={cashSales}
        employeeName={employee?.name || ''}
        shiftStartedAt={shift?.startedAt}
        onClose={() => {
          setShiftModal(false)
          setPendingAction(null)
          setShiftResume(null)
        }}
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
