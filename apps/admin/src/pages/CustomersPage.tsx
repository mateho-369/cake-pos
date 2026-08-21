import { useEffect, useMemo, useState } from 'react'
import {
  AtSign,
  ChevronLeft,
  Phone,
  Search,
  Send,
  ShoppingBag,
  UserRound,
} from 'lucide-react'
import type { Customer, Order } from '../data'
import { useAdminData } from '../lib/data'

export default function CustomersPage() {
  const { customers, customerOrders } = useAdminData()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [history, setHistory] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const visible = useMemo(
    () =>
      customers.filter((customer) =>
        `${customer.name} ${customer.phone || ''} ${customer.telegramUsername || ''}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [customers, query],
  )
  useEffect(() => {
    if (!selected) return
    setLoading(true)
    customerOrders(selected.id)
      .then(setHistory)
      .finally(() => setLoading(false))
  }, [selected, customerOrders])
  return (
    <div className="page-content">
      <section className="customer-admin-intro">
        <div>
          <span>CUSTOMER DIRECTORY</span>
          <h1>Telegram customers</h1>
          <p>People who have ordered through your customer Mini App.</p>
        </div>
        <div className="customer-admin-stat glass-panel">
          <UserRound size={20} />
          <span>
            <strong>{customers.length}</strong>
            <small>Total customers</small>
          </span>
        </div>
      </section>
      <section className="page-toolbar catalog-toolbar">
        <label className="inline-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone or username"
          />
        </label>
      </section>
      <section
        className={`customers-admin-layout ${selected ? 'with-detail' : ''}`}
      >
        <div className="customer-cards">
          {visible.map((customer) => (
            <button
              className="glass-panel customer-admin-card"
              onClick={() => setSelected(customer)}
              key={customer.id}
            >
              <span className="customer-admin-avatar">
                {customer.name
                  .split(/\s+/)
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div>
                <strong>{customer.name}</strong>
                {customer.telegramUsername && (
                  <small>
                    <AtSign size={12} />
                    {customer.telegramUsername}
                  </small>
                )}
                <small>
                  <Phone size={12} />
                  {customer.phone || 'Phone not shared'}
                </small>
              </div>
              <span className="customer-admin-totals">
                <strong>${customer.totalSpent.toFixed(2)}</strong>
                <small>
                  {customer.totalOrders} order
                  {customer.totalOrders === 1 ? '' : 's'}
                </small>
              </span>
            </button>
          ))}
          {!visible.length && (
            <div className="glass-panel customer-admin-empty">
              <UserRound />
              <strong>No customers found</strong>
              <span>
                Telegram customers appear here after opening the storefront.
              </span>
            </div>
          )}
        </div>
        {selected && (
          <aside className="glass-panel customer-history">
            <header>
              <button onClick={() => setSelected(null)}>
                <ChevronLeft size={17} />
              </button>
              <div>
                <small>CUSTOMER</small>
                <h2>{selected.name}</h2>
              </div>
            </header>
            <div className="customer-history-contact">
              <span>
                <Phone size={14} />
                {selected.phone || 'Not shared'}
              </span>
              <span>
                <Send size={14} />
                {selected.telegramUsername
                  ? `@${selected.telegramUsername}`
                  : `Telegram ${selected.telegramUserId}`}
              </span>
            </div>
            <h3>Order history</h3>
            {loading ? (
              <p>Loading orders…</p>
            ) : (
              <div className="customer-history-orders">
                {history.map((order) => (
                  <article key={order.id}>
                    <span>
                      <ShoppingBag size={15} />
                    </span>
                    <div>
                      <strong>{order.id}</strong>
                      <small>{order.detail.join(', ')}</small>
                    </div>
                    <div>
                      <strong>${order.total.toFixed(2)}</strong>
                      <small>{order.status}</small>
                    </div>
                  </article>
                ))}
                {!history.length && <p>No orders yet.</p>}
              </div>
            )}
          </aside>
        )}
      </section>
    </div>
  )
}
