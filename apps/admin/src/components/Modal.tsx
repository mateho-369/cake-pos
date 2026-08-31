import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../lib/i18n'
export default function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  size = 'medium',
  sheet = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  children: ReactNode
  size?: 'small' | 'medium' | 'large'
  sheet?: boolean
}) {
  const { t } = useTranslation()
  // Escape dismisses the dialog, matching the backdrop click.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  // Portaled to <body>: the modal must never be a descendant of a page
  // section with a transform animation or backdrop-filter, because either
  // turns that ancestor into the containing block / stacking context and
  // traps the fixed layer under the topbar, sidebar and other chrome.
  return createPortal(
    <div
      className={`modal-layer ${sheet ? 'sheet-layer' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        className="modal-backdrop"
        onClick={onClose}
        aria-label={t('modal.closeDialog')}
      />
      <section
        className={`modal-card modal-${size} ${sheet ? 'sheet-card' : ''}`}
      >
        <header className="modal-header">
          <div>
            {eyebrow && <span>{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t('modal.close')}
          >
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  )
}
