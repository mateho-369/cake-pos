/**
 * Pending-orders panel harness — mounts the REAL TerminalHeader and the
 * REAL PendingOrdersPanel (the Telegram customer-order queue) against
 * recorded callbacks instead of a live API, so the reject / message /
 * discoverability behaviour can be driven from jsdom.
 */
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { StaffAuthProvider } from '../../apps/sale/src/auth/StaffAuthContext'
import { LanguageProvider } from '../../apps/sale/src/lib/i18n'
import PendingOrdersPanel from '../../apps/sale/src/components/PendingOrdersPanel'
import TerminalHeader from '../../apps/sale/src/components/TerminalHeader'
import type { PendingOrder } from '../../apps/sale/src/data'

declare global {
  interface Window {
    __calls: Array<{ kind: string; orderId?: string; arg?: unknown }>
    __toasts: string[]
    __toolbarPendingClicks: number
  }
}

window.__calls = []
window.__toasts = []
window.__toolbarPendingClicks = 0

const ORDERS: PendingOrder[] = [
  {
    id: 'TG-31',
    pickupCode: 'K7QZ',
    isStale: false,
    createdAt: new Date().toISOString(),
    status: 'Pending',
    total: 18.5,
    detail: ['Matcha Pistachio Cake × 1', 'Latte × 2'],
    customer: {
      name: 'Srey Neang',
      phone: '+855 12 345 678',
      telegramUserId: '77',
    },
  },
  {
    id: 'TG-32',
    pickupCode: 'AB23',
    isStale: true,
    createdAt: '2026-08-26T09:00:00Z',
    status: 'Confirmed',
    total: 34,
    detail: ['Chocolate Cake × 1'],
    // No Telegram chat id: only the phone link may appear on this card.
    customer: { name: 'Vibol', phone: '+855 92 111 222' },
  },
]

function Harness() {
  const [toast, setToast] = useState<string | null>(null)
  return (
    <LanguageProvider>
      <StaffAuthProvider>
        <TerminalHeader
          shiftOpen
          onShift={() => {}}
          query=""
          onQuery={() => {}}
          cartCount={0}
          heldCount={1}
          pendingCount={2}
          onCart={() => {}}
          onHeld={() => {}}
          onPending={() => {
            window.__toolbarPendingClicks += 1
          }}
          onHistory={() => {}}
          onCustomerDisplay={() => {}}
        />
        <div id="case-orders">
          <PendingOrdersPanel
            pending={ORDERS}
            shiftOpen
            rate={4100}
            onPay={async (orderId, method, usdCents) => {
              window.__calls.push({
                kind: 'pay',
                orderId,
                arg: { method, usdCents },
              })
            }}
            onAccept={async (orderId) => {
              window.__calls.push({ kind: 'accept', orderId })
            }}
            onReject={async (orderId, reason) => {
              window.__calls.push({ kind: 'reject', orderId, arg: reason })
            }}
            onMessage={async (orderId, text) => {
              window.__calls.push({ kind: 'message', orderId, arg: text })
              return true
            }}
            onNeedShift={(resume) => resume()}
            onToast={(message) => {
              window.__toasts.push(message)
              setToast(message)
            }}
          />
        </div>
        {/* A cashier who has never received a Telegram order: the panel is
            opened from the toolbar and must explain itself, not vanish. */}
        <div id="case-empty">
          <PendingOrdersPanel
            pending={[]}
            open
            shiftOpen
            rate={4100}
            onPay={async () => {}}
            onAccept={async () => {}}
            onReject={async () => {}}
            onMessage={async () => false}
            onNeedShift={(resume) => resume()}
            onToast={(message) => window.__toasts.push(message)}
          />
        </div>
        <div id="toast-sink" data-toast={toast ?? ''} />
      </StaffAuthProvider>
    </LanguageProvider>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
