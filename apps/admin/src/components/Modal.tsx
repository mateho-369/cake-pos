import { X } from 'lucide-react'
import type { ReactNode } from 'react'

type ModalProps = {
  title: string
  eyebrow?: string
  open: boolean
  onClose: () => void
  children: ReactNode
  size?: 'small' | 'medium' | 'large'
}

export default function Modal({ title, eyebrow, open, onClose, children, size = 'medium' }: ModalProps) {
  if (!open) return null
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button className="modal-backdrop" onClick={onClose} aria-label="Close modal" />
      <section className={`modal-card modal-${size}`}>
        <div className="modal-header">
          <div>{eyebrow && <span>{eyebrow}</span>}<h2>{title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </section>
    </div>
  )
}
