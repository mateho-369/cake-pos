import { useEffect, useState } from 'react'
import { Banknote, ChevronDown, QrCode } from 'lucide-react'
import { api, formatDateTime, money, type Order } from '@bloom/shared'

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    void api.orders.list().then(setOrders)
  }, [])

  return (
    <div className="bloom-in mx-auto max-w-4xl pb-10">
      <h1 className="text-3xl font-semibold tracking-tight">Orders</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
        Every ticket from the sale terminal.
      </p>
      <ul className="mt-6 space-y-2">
        {orders.map((order) => {
          const open = openId === order.id
          return (
            <li key={order.id} className="glass overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
                onClick={() => setOpenId(open ? null : order.id)}
              >
                <span className="grid h-10 w-10 place-items-center rounded-2xl glass-soft">
                  {order.paymentMethod === 'khqr' ? <QrCode size={16} /> : <Banknote size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{order.orderNumber}</span>
                  <span className="block truncate text-xs" style={{ color: 'var(--ink-3)' }}>
                    {formatDateTime(order.createdAt)} · {order.cashierName} · {order.items.reduce((s, i) => s + i.quantity, 0)} items
                  </span>
                </span>
                <span className="price">{money(order.total)}</span>
                <span className="badge badge-fresh">{order.status}</span>
                <ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="px-4 pb-4">
                  {order.items.map((item) => (
                    <div key={item.productId + item.name} className="flex justify-between py-1 text-sm">
                      <span>
                        {item.quantity} × {item.name}
                      </span>
                      <span className="tabular">{money(item.lineTotal)}</span>
                    </div>
                  ))}
                  {order.paymentMethod === 'cash' && order.cashTendered !== undefined && (
                    <p className="mt-2 text-xs" style={{ color: 'var(--ink-3)' }}>
                      Tendered {money(order.cashTendered)} · change {money(order.change ?? 0)}
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
