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
import { apiRequest } from '../lib/api'
import { useTranslation } from '../lib/i18n'

type Retention = {
  customersWithOrders: number
  newCustomers: number
  returningCustomers: number
  repeatRatePercent: number
}

export default function CustomersPage() {
  const { t } = useTranslation()
  const { customers, customerOrders } = useAdminData()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [history, setHistory] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [retention, setRetention] = useState<Retention | null>(null)
  useEffect(() => {
    let alive = true
    apiRequest<Retention>('/api/reports/retention?preset=this_month')
      .then((data) => alive && setRetention(data))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
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
          <span>{t('customers.eyebrow')}</span>
          <h1>{t('customers.title')}</h1>
          <p>{t('customers.subtitle')}</p>
        </div>
        <div className="customer-admin-stat glass-panel">
          <UserRound size={20} />
          <span>
            <strong>{customers.length}</strong>
            <small>{t('customers.totalCustomers')}</small>
          </span>
        </div>
      </section>
      {retention && (
        <section className="retention-strip">
          <div className="glass-panel retention-card">
            <span>{t('reports.customersWithOrders')}</span>
            <strong>{retention.customersWithOrders}</strong>
            <small>{t('dashboard.today')}</small>
          </div>
          <div className="glass-panel retention-card">
            <span>{t('reports.newCustomers')}</span>
            <strong>{retention.newCustomers}</strong>
            <small>{t('reports.thisMonth')}</small>
          </div>
          <div className="glass-panel retention-card">
            <span>{t('reports.returningCustomers')}</span>
            <strong>{retention.returningCustomers}</strong>
            <small>{t('reports.thisMonth')}</small>
          </div>
          <div className="glass-panel retention-card accent">
            <span>{t('reports.repeatRate')}</span>
            <strong>{retention.repeatRatePercent}%</strong>
            <small>{t('reports.thisMonth')}</small>
          </div>
        </section>
      )}
      <section className="page-toolbar catalog-toolbar">
        <label className="inline-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('customers.searchPlaceholder')}
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
                  {customer.phone || t('customers.phoneNotShared')}
                </small>
              </div>
              <span className="customer-admin-totals">
                <strong>${customer.totalSpent.toFixed(2)}</strong>
                <small>
                  {t(
                    customer.totalOrders === 1
                      ? 'customers.ordersCount'
                      : 'customers.ordersCountOther',
                    { count: customer.totalOrders },
                  )}
                </small>
              </span>
            </button>
          ))}
          {!visible.length && (
            <div className="glass-panel customer-admin-empty">
              <UserRound />
              <strong>{t('customers.noCustomers')}</strong>
              <span>{t('customers.noCustomersHint')}</span>
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
                <small>{t('customers.customer')}</small>
                <h2>{selected.name}</h2>
              </div>
            </header>
            <div className="customer-history-contact">
              <span>
                <Phone size={14} />
                {selected.phone || t('customers.phoneNotShared')}
              </span>
              <span>
                <Send size={14} />
                {selected.telegramUsername
                  ? `@${selected.telegramUsername}`
                  : `Telegram ${selected.telegramUserId}`}
              </span>
            </div>
            <h3>{t('customers.orderHistory')}</h3>
            {loading ? (
              <p>{t('customers.loadingOrders')}</p>
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
                {!history.length && <p>{t('customers.noOrdersYet')}</p>}
              </div>
            )}
          </aside>
        )}
      </section>
    </div>
  )
}
