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
      <div className="app-shell grid place-items-center px-5">
        <div className="glass-strong p-6 text-center">
          <p className="font-semibold">Could not reach the API</p>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-3)' }}>{loadError}</p>
        </div>
      </div>
    )
  }
  if (shift === undefined || !settings) {
    return (
      <div className="app-shell grid place-items-center">
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

  const CartBody = (
    <>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-semibold tracking-tight">Ticket</h2>
        {cart.length > 0 && (
          <button type="button" className="text-xs font-medium" style={{ color: 'var(--pink-deep)' }} onClick={() => setCart([])}>
            Clear
          </button>
        )}
      </div>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {cart.length === 0 && (
          <p className="px-1 py-10 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
            Tap a cake to add it.
          </p>
        )}
        {cart.map((line) => (
          <div key={line.productId} className="glass-soft flex items-center gap-3 p-2">
            <img src={line.imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{line.name}</p>
              <p className="price text-sm">{money(line.unitPrice * line.quantity)}</p>
            </div>
            <QtyStepper value={line.quantity} onChange={(n) => setQty(line.productId, n)} />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Horizon className="mb-3 opacity-70" />
        <div className="flex items-end justify-between">
          <span className="text-sm" style={{ color: 'var(--ink-3)' }}>
            {count} item{count === 1 ? '' : 's'}
          </span>
          <span className="price text-3xl">{money(subtotal)}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn-glass"
            disabled={!cart.length}
            onClick={() => {
              setPayMethod('cash')
              setPayOpen(true)
            }}
          >
            Cash
          </button>
          <button
            type="button"
            className="btn-pink btn-pink-ring"
            disabled={!cart.length}
            onClick={() => {
              setPayMethod('khqr')
              setPayOpen(true)
            }}
          >
            KHQR
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="app-shell flex flex-col">
      <header className="glass relative mx-3 mt-3 flex items-center gap-3 rounded-[22px] px-3 py-2.5 sm:mx-4 sm:px-4">
        <div className="hidden sm:block">
          <Logo size={32} />
        </div>
        <div className="min-w-0 sm:hidden">
          <p className="truncate text-sm font-semibold">{user.name.split(' ')[0]}</p>
          <p className="text-[0.65rem]" style={{ color: 'var(--ink-3)' }}>
            Shift {duration(shift.openedAt)}
          </p>
        </div>
        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="text-[0.7rem]" style={{ color: 'var(--ink-3)' }}>
            Shift open · {duration(shift.openedAt)}
          </p>
        </div>
        <label className="glass-soft relative ml-auto flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-2 sm:max-w-xs">
          <Search size={16} style={{ color: 'var(--ink-3)' }} />
          <input
            className="w-full bg-transparent text-sm outline-none"
            placeholder="Search cakes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-full"
          onClick={() => void logout()}
          aria-label="Log out"
        >
          <LogOut size={18} />
        </button>
      </header>

      <div className="relative mx-3 mt-3 flex min-h-0 flex-1 gap-3 sm:mx-4 sm:mb-4">
        <section className="relative flex min-w-0 flex-1 flex-col">
          <div className="scroll-hide mb-3 flex gap-2 overflow-x-auto pb-1">
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
          <div className="scroll-hide grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto pb-28 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 lg:pb-8">
            {visible.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={add} />
            ))}
          </div>
          <button type="button" className="fab lg:bottom-6" onClick={() => setAddOpen(true)} aria-label="Add cake">
            <Plus size={26} />
          </button>
        </section>

        <aside className="glass hidden w-[380px] shrink-0 flex-col rounded-[26px] p-4 lg:flex">{CartBody}</aside>
      </div>

      <div className="lg:hidden">
        <button
          type="button"
          className="glass mx-3 mb-3 flex w-[calc(100%-1.5rem)] items-center justify-between rounded-[22px] px-4 py-3"
          onClick={() => setMobileCart(true)}
        >
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            <ShoppingBag size={16} /> {count} in ticket
          </span>
          <span className="price text-xl">{money(subtotal)}</span>
        </button>
      </div>

      <AnimatePresence>
        {mobileCart && (
          <motion.div
            className="fixed inset-0 z-30 lg:hidden"
            style={{ background: 'rgba(59,10,31,0.28)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileCart(false)}
          >
            <motion.div
              className="sheet absolute inset-x-0 bottom-0 flex max-h-[86%] flex-col rounded-t-[28px] p-4"
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex justify-end">
                <button type="button" className="btn-glass h-9 w-9 !p-0" onClick={() => setMobileCart(false)} aria-label="Close cart">
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
