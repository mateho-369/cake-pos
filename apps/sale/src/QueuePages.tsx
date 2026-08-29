import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useStaffAuth } from './auth/StaffAuthContext'
import { useSaleData } from './lib/data'
import { apiRequest } from './lib/api'
import { cashTenderPayload } from './lib/tender'
import { useTranslation } from './lib/i18n'
import PendingOrdersPanel from './components/PendingOrdersPanel'
import HeldOrdersPanel from './components/HeldOrdersPanel'
import ShiftModal from './components/ShiftModal'
import type { HeldOrder, PendingOrder } from './data'

function gotoTerminal() {
  window.location.assign('/')
}

function useToast() {
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])
  return { toast, setToast }
}

function PageShell({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children: ReactNode
}) {
  return (
    <main className="queue-page">
      <header className="queue-page-head">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={18} /> {title}
        </button>
      </header>
      {children}
    </main>
  )
}

/**
 * Shared open-shift gating for the dedicated held/pending pages. Opening a
 * shift here keeps the whole flow on the dedicated page instead of dumping
 * the cashier back to the terminal mid-action.
 */
function useQueueShift() {
  const { t } = useTranslation()
  const { currentShift, openShift } = useSaleData()
  const { toast, setToast } = useToast()
  const [modal, setModal] = useState(false)
  const [shiftResume, setShiftResume] = useState<(() => void) | null>(null)
  const shift = currentShift ?? null
  const requestShiftThen = (resume: () => void) => {
    if (shift) {
      resume()
      return
    }
    setShiftResume(() => resume)
    setModal(true)
  }
  const confirmShift = async (amount: number, amountKhr = 0) => {
    try {
      await openShift(amount, amountKhr)
      setToast(
        t('sale.shiftOpenedWith', { amount: amount.toFixed(2) }) +
          (amountKhr ? ` · ៛${amountKhr.toLocaleString()}` : ''),
      )
      setModal(false)
      if (shiftResume) {
        const resume = shiftResume
        setShiftResume(null)
        resume()
      }
    } catch (reason) {
      setToast(
        reason instanceof Error ? reason.message : t('sale.shiftFailed'),
      )
    }
  }
  return { shift, requestShiftThen, confirmShift, modal, setModal, toast, setToast }
}

/** Dedicated route (a real page, not the inline overlay). */
export function HeldOrdersPage() {
  const { t } = useTranslation()
  const { employee } = useStaffAuth()
  const { exchangeRateKhrPerUsd, refresh } = useSaleData()
  const [held, setHeld] = useState<HeldOrder[]>([])
  const [busy, setBusy] = useState(false)
  const { toast, setToast } = useToast()
  const shiftGate = useQueueShift()
  const loadHeld = useCallback(async () => {
    try {
      const next = await apiRequest<HeldOrder[]>('/api/orders/held')
      setHeld(next.filter((order) => order.status === 'Held'))
    } catch {
      /* offline / logged out — next poll picks it up */
    }
  }, [])
  useEffect(() => {
    void loadHeld()
    const timer = window.setInterval(() => void loadHeld(), 15_000)
    return () => window.clearInterval(timer)
  }, [loadHeld])

  const resumeHold = (order: HeldOrder) => {
    // A full page change to the terminal; the terminal reads this id on mount
    // and puts the hold's lines back into the cart.
    sessionStorage.setItem('cake-pos-resume-hold-id', order.id)
    gotoTerminal()
  }
  const payHold = async (
    order: HeldOrder,
    method: 'Cash' | 'KHQR',
    tender: { usdReceivedCents: number; khrReceived: number },
  ) => {
    if (!shiftGate.shift) {
      shiftGate.requestShiftThen(() => void payHold(order, method, tender))
      return
    }
    setBusy(true)
    try {
      await apiRequest(`/api/orders/${order.id}/pay`, {
        method: 'POST',
        body: JSON.stringify(
          method === 'Cash'
            ? {
                method: 'Cash',
                ...cashTenderPayload(
                  Math.round(order.total * 100),
                  tender.usdReceivedCents,
                  tender.khrReceived,
                  exchangeRateKhrPerUsd,
                ),
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
      setBusy(false)
    }
  }
  const voidHold = async (order: HeldOrder) => {
    setBusy(true)
    try {
      await apiRequest(`/api/orders/${order.id}/cancel`, { method: 'POST' })
      setToast(t('hold.voided', { id: order.holdLabel || order.id }))
      await Promise.all([loadHeld(), refresh()])
    } catch (reason) {
      setToast(
        reason instanceof Error ? reason.message : t('sale.paymentFailed'),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <PageShell title={t('hold.title')} onBack={() => gotoTerminal()}>
      <HeldOrdersPanel
        held={held}
        busy={busy}
        open
        rate={exchangeRateKhrPerUsd}
        onResume={resumeHold}
        onPay={payHold}
        onVoid={voidHold}
      />
      <ShiftModal
        open={shiftGate.modal}
        mode="open"
        expectedCash={0}
        expectedCashKhr={0}
        openingCash={0}
        openingCashKhr={0}
        cashSales={0}
        cashSalesKhr={0}
        employeeName={employee?.name || ''}
        onClose={() => shiftGate.setModal(false)}
        onConfirm={shiftGate.confirmShift}
      />
      {shiftGate.toast && <QueueToast message={shiftGate.toast} />}
      {toast && <QueueToast message={toast} />}
    </PageShell>
  )
}

/** Dedicated route: pending Telegram customer orders that need staff action. */
export function PendingOrdersPage() {
  const { t } = useTranslation()
  const { employee } = useStaffAuth()
  const { exchangeRateKhrPerUsd, refresh } = useSaleData()
  const [pending, setPending] = useState<PendingOrder[]>([])
  const { toast, setToast } = useToast()
  const shiftGate = useQueueShift()
  const loadPending = useCallback(async () => {
    try {
      const next = await apiRequest<PendingOrder[]>('/api/orders/pending')
      setPending(next)
    } catch {
      /* offline / logged out — next poll picks it up */
    }
  }, [])
  useEffect(() => {
    void loadPending()
    const timer = window.setInterval(() => void loadPending(), 15_000)
    return () => window.clearInterval(timer)
  }, [loadPending])

  const payPending = async (
    orderId: string,
    method: 'Cash' | 'KHQR',
    tender: {
      usdReceivedCents: number
      khrReceived: number
      totalCents: number
    },
  ) => {
    if (!shiftGate.shift) {
      shiftGate.requestShiftThen(() => void payPending(orderId, method, tender))
      return
    }
    try {
      await apiRequest(`/api/orders/${orderId}/pay`, {
        method: 'POST',
        body: JSON.stringify(
          method === 'Cash'
            ? {
                method: 'Cash',
                ...cashTenderPayload(
                  tender.totalCents,
                  tender.usdReceivedCents,
                  tender.khrReceived,
                  exchangeRateKhrPerUsd,
                ),
              }
            : { method: 'KHQR', confirmed: true },
        ),
      })
      setToast(t('pending.paid', { id: orderId }))
      await Promise.all([loadPending(), refresh()])
    } catch (reason) {
      setToast(
        reason instanceof Error ? reason.message : t('sale.paymentFailed'),
      )
    }
  }
  const acceptPending = async (orderId: string) => {
    if (!shiftGate.shift) {
      shiftGate.requestShiftThen(() => void acceptPending(orderId))
      return
    }
    try {
      await apiRequest(`/api/orders/${orderId}/accept`, { method: 'POST' })
      setToast(t('pending.accepted', { id: orderId }))
      await Promise.all([loadPending(), refresh()])
    } catch (reason) {
      setToast(
        reason instanceof Error ? reason.message : t('sale.paymentFailed'),
      )
    }
  }
  const rejectPending = async (orderId: string, reason?: string) => {
    await apiRequest(`/api/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {}),
    })
    await Promise.all([refresh(), loadPending()])
  }
  const messagePending = async (orderId: string, text: string) => {
    const result = await apiRequest<{ delivered: boolean }>(
      `/api/orders/${orderId}/message`,
      { method: 'POST', body: JSON.stringify({ text }) },
    )
    return result.delivered
  }
  return (
    <PageShell title={t('pending.title')} onBack={() => gotoTerminal()}>
      <PendingOrdersPanel
        pending={pending}
        open
        shiftOpen={Boolean(shiftGate.shift)}
        rate={exchangeRateKhrPerUsd}
        onPay={payPending}
        onAccept={acceptPending}
        onReject={rejectPending}
        onMessage={messagePending}
        onNeedShift={shiftGate.requestShiftThen}
        onToast={setToast}
      />
      <ShiftModal
        open={shiftGate.modal}
        mode="open"
        expectedCash={0}
        expectedCashKhr={0}
        openingCash={0}
        openingCashKhr={0}
        cashSales={0}
        cashSalesKhr={0}
        employeeName={employee?.name || ''}
        onClose={() => shiftGate.setModal(false)}
        onConfirm={shiftGate.confirmShift}
      />
      {shiftGate.toast && <QueueToast message={shiftGate.toast} />}
      {toast && <QueueToast message={toast} />}
    </PageShell>
  )
}

function QueueToast({ message }: { message: string }) {
  return (
    <div className="sale-toast">
      <span>{message}</span>
    </div>
  )
}
