import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { money } from '../lib/money'

export default function SuccessOverlay({
  open,
  total,
  orderNumber,
  method,
}: {
  open: boolean
  total: number
  orderNumber: string
  method: string
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center px-6"
          style={{ background: 'rgba(253, 242, 246, 0.72)', backdropFilter: 'blur(22px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="glass-strong specular w-full max-w-sm px-8 py-10 text-center"
            initial={{ scale: 0.86, y: 18 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 24 }}
          >
            <span
              className="mx-auto grid h-20 w-20 place-items-center rounded-full"
              style={{
                background: 'linear-gradient(180deg, #F9A8D4, #F472B6)',
                boxShadow: '0 12px 30px rgba(244,114,182,0.4)',
              }}
            >
              <Check size={38} color="white" strokeWidth={2.6} />
            </span>
            <p className="mt-6 text-sm font-medium uppercase tracking-[0.18em]" style={{ color: 'var(--ink-3)' }}>
              Paid · {method}
            </p>
            <p className="price mt-2 text-4xl">{money(total)}</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--ink-3)' }}>
              {orderNumber}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
