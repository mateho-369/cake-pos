import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export default function Modal({ open, onClose, title, eyebrow, children, size = 'medium', sheet = false }: {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  children: ReactNode
  size?: 'small' | 'medium' | 'large'
  sheet?: boolean
}) {
  if (!open) return null
  return (
    <div className={`modal-layer ${sheet ? 'sheet-layer' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <button className="modal-backdrop" onClick={onClose} aria-label="Close dialog" />
      <section className={`modal-card modal-${size} ${sheet ? 'sheet-card' : ''}`}>
        <header className="modal-header"><div>{eyebrow && <span>{eyebrow}</span>}<h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
        {children}
      </section>
    </div>
  )
}
