import { Printer, ReceiptText } from 'lucide-react'
import type { SaleOrder } from '../data'
import Modal from './Modal'
import { printReceipt } from '../lib/receipt'
const safeNumber = (value: number | null | undefined) =>
  Number.isFinite(value as number) ? (value as number) : 0
const usd = (value: number | null | undefined) =>
  `$${safeNumber(value).toFixed(2)}`
export default function OrderHistoryModal({
  open,
  orders,
  onClose,
  onError,
}: {
  open: boolean
  orders: SaleOrder[]
  onClose: () => void
  onError: (message: string) => void
}) {
  const print = (id: string, copies: 1 | 2) =>
    void printReceipt(id, copies).catch((error) =>
      onError(error instanceof Error ? error.message : 'Print failed'),
    )
  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="RECEIPTS"
      title="Order history"
      size="medium"
    >
      <div className="sale-order-history">
        {orders.map((order) => (
          <article key={order.id}>
            <span>
              <ReceiptText size={17} />
            </span>
            <div>
              <strong>{order.id}</strong>
              <small>
                {order.time} · {order.detail.join(', ')}
              </small>
            </div>
            <b>{usd(order.total)}</b>
            <div>
              <button onClick={() => print(order.id, 1)}>
                <Printer size={14} /> Customer
              </button>
              <button onClick={() => print(order.id, 2)}>
                <Printer size={14} /> + Store
              </button>
            </div>
          </article>
        ))}
        {!orders.length && <p>No completed orders yet.</p>}
      </div>
    </Modal>
  )
}
