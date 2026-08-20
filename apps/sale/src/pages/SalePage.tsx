import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { LogOut, Plus, Search, ShoppingBag, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  api,
  duration,
  money,
  useAuth,
  type CartLine,
  type Category,
  type PaymentMethod,
  type Product,
  type Settings,
  type Shift,
} from '@bloom/shared'
import ProductCard from '@bloom/shared/components/ProductCard'
import QtyStepper from '@bloom/shared/components/QtyStepper'
import AddProductSheet from '@bloom/shared/components/AddProductSheet'
import PaymentSheet from '@bloom/shared/components/PaymentSheet'
import SuccessOverlay from '@bloom/shared/components/SuccessOverlay'
import OpenShiftModal from '@bloom/shared/components/OpenShiftModal'
import Logo from '@bloom/shared/components/Logo'
import Horizon from '@bloom/shared/components/Horizon'

export default function SalePage() {
  const { user, logout } = useAuth()
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [cart, setCart] = useState<CartLine[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [mobileCart, setMobileCart] = useState(false)
  const [success, setSuccess] = useState<{ total: number; orderNumber: string; method: string } | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [shift, setShift] = useState<Shift | null | undefined>(undefined)
  const [loadError, setLoadError] = useState('')

  const reload = useCallback(async () => {
    const [p, c, s, sh] = await Promise.all([
      api.products.list(),
      api.categories.list(),
      api.settings.get(),
      api.shifts.current(),
    ])
    setProducts(p)
    setCategories(c)
    setSettings(s)
    setShift(sh.shift)
  }, [])

  useEffect(() => {
    if (!user) return
    reload().catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Could not load catalog.'))
  }, [user, reload])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products
      .filter((p) => p.isActive)
      .filter((p) => categoryId === 'all' || p.categoryId === categoryId)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
  }, [products, categoryId, query])

  if (!user) return <Navigate to="/login" replace />
  if (loadError) {
    return (
      <div className="auth-shell">
        <div className="auth-card glass-strong text-center">
          <p className="font-semibold">Could not reach the API</p>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-3)' }}>{loadError}</p>
        </div>
      </div>
    )
  }
  if (shift === undefined || !settings) {
    return (
      <div className="auth-shell">
        <p style={{ color: 'var(--ink-3)' }}>Opening Bloom…</p>
      </div>
    )
  }
  if (!shift) {
    return (
      <OpenShiftModal
        name={user.name}
        onOpen={async (openingCash) => {
          const next = await api.shifts.open(openingCash)
          setShift(next)
        }}
      />
    )
  }

  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
  const count = cart.reduce((s, l) => s + l.quantity, 0)

  const add = (product: Product) => {
    setCart((prev) => {
      const found = prev.find((l) => l.productId === product.id)
      if (found) return prev.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l))
      return [
        ...prev,
        { productId: product.id, name: product.name, imageUrl: product.imageUrl, unitPrice: product.price, quantity: 1 },
      ]
    })
  }

  const setQty = (id: string, quantity: number) => {
    setCart((prev) => (quantity <= 0 ? prev.filter((l) => l.productId !== id) : prev.map((l) => (l.productId === id ? { ...l, quantity } : l))))
  }

  const confirm = async (method: PaymentMethod, cashTendered?: number) => {
    try {
      const order = await api.orders.create({ items: cart, paymentMethod: method, cashTendered })
      setCart([])
      setPayOpen(false)
      setMobileCart(false)
      setSuccess({ total: order.total, orderNumber: order.orderNumber, method: method === 'khqr' ? 'KHQR' : 'Cash' })
      window.setTimeout(() => setSuccess(null), 2200)
      const [p, sh] = await Promise.all([api.products.list(), api.shifts.current()])
      setProducts(p)
      setShift(sh.shift)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not complete order.')
    }
  }

  const openPay = (method: PaymentMethod) => {
    setPayMethod(method)
    setPayOpen(true)
  }

  const CartBody = (
    <div className="sale-cart-body">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight">Ticket</h2>
        {cart.length > 0 && (
          <button type="button" className="text-xs font-semibold" style={{ color: 'var(--pink-deep)' }} onClick={() => setCart([])}>
            Clear
          </button>
        )}
      </div>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {cart.length === 0 && (
          <p className="px-1 py-8 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
            Tap a cake to add it.
          </p>
        )}
        {cart.map((line) => (
          <div key={line.productId} className="glass-soft flex items-center gap-2.5 p-2">
            <img src={line.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{line.name}</p>
              <p className="price text-sm">{money(line.unitPrice * line.quantity)}</p>
            </div>
            <QtyStepper value={line.quantity} onChange={(n) => setQty(line.productId, n)} />
          </div>
        ))}
      </div>
      <div className="mt-3 shrink-0">
        <Horizon className="mb-3 opacity-80" />
        <div className="flex items-end justify-between gap-3">
          <span className="text-sm" style={{ color: 'var(--ink-3)' }}>
            {count} item{count === 1 ? '' : 's'}
          </span>
          <span className="price text-[1.85rem] leading-none">{money(subtotal)}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="btn-glass" disabled={!cart.length} onClick={() => openPay('cash')}>
            Cash
          </button>
          <button type="button" className="btn-pink btn-pink-ring" disabled={!cart.length} onClick={() => openPay('khqr')}>
            KHQR
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="sale-shell">
      <header className="sale-top glass">
        <Logo size={32} compact />
        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-sm font-semibold leading-tight">{user.name}</p>
          <p className="text-[0.68rem] leading-tight" style={{ color: 'var(--ink-3)' }}>
            Shift · {duration(shift.openedAt)}
          </p>
        </div>
        <label className="sale-search glass-soft">
          <Search size={15} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
          <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-full" onClick={() => void logout()} aria-label="Log out">
          <LogOut size={18} />
        </button>
      </header>

      <div className="sale-main">
        <section className="sale-catalog">
          <div className="sale-pills scroll-hide">
            <button type="button" className={`pill ${categoryId === 'all' ? 'pill-active' : ''}`} onClick={() => setCategoryId('all')}>
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`pill ${categoryId === c.id ? 'pill-active' : ''}`}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="sale-grid scroll-hide">
            {visible.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={add} />
            ))}
          </div>
          <button type="button" className="fab" onClick={() => setAddOpen(true)} aria-label="Add cake">
            <Plus size={24} />
          </button>
        </section>

        <aside className="sale-cart glass">{CartBody}</aside>
      </div>

      <button type="button" className="sale-dock glass" onClick={() => setMobileCart(true)}>
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <ShoppingBag size={16} /> {count} in ticket
        </span>
        <span className="price text-xl leading-none">{money(subtotal)}</span>
      </button>

      <AnimatePresence>
        {mobileCart && (
          <motion.div
            className="mobile-only fixed inset-0 z-30"
            style={{ background: 'rgba(59,10,31,0.32)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileCart(false)}
          >
            <motion.div
              className="sheet absolute inset-x-0 bottom-0 flex flex-col rounded-t-[28px] p-4 pb-6"
              style={{ height: 'min(78dvh, 640px)' }}
              initial={{ y: 48 }}
              animate={{ y: 0 }}
              exit={{ y: 48 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: 'rgba(59,10,31,0.14)' }} />
              <div className="mb-1 flex justify-end">
                <button type="button" className="btn-icon" onClick={() => setMobileCart(false)} aria-label="Close cart">
                  <X size={16} />
                </button>
              </div>
              {CartBody}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddProductSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        categories={categories}
        bestBeforeDays={settings.bestBeforeDays}
        onSave={async (input) => {
          await api.products.create(input)
          setProducts(await api.products.list())
        }}
      />
      <PaymentSheet
        open={payOpen}
        total={subtotal}
        onClose={() => setPayOpen(false)}
        onConfirm={(method, tendered) => void confirm(method, tendered)}
        initialMethod={payMethod}
        settings={settings}
      />
      <SuccessOverlay
        open={Boolean(success)}
        total={success?.total ?? 0}
        orderNumber={success?.orderNumber ?? ''}
        method={success?.method ?? ''}
      />
    </div>
  )
}
