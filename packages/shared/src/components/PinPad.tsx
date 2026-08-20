import { Delete } from 'lucide-react'

export default function PinPad({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string
  onChange: (next: string) => void
  onComplete?: (pin: string) => void
  disabled?: boolean
}) {
  const press = (digit: string) => {
    if (disabled) return
    if (value.length >= 4) return
    const next = value + digit
    onChange(next)
    if (next.length === 4) onComplete?.(next)
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

  return (
    <div className="pin-pad">
      <div className="pin-dots">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`pin-dot ${i < value.length ? 'on' : ''}`} />
        ))}
      </div>
      <div className="pin-grid">
        {keys.map((key) => {
          if (key === '') return <span key="empty" />
          if (key === 'del') {
            return (
              <button
                key="del"
                type="button"
                className="pin-key"
                onClick={() => !disabled && onChange(value.slice(0, -1))}
                aria-label="Delete"
                disabled={disabled}
              >
                <Delete size={16} className="mx-auto" />
              </button>
            )
          }
          return (
            <button key={key} type="button" className="pin-key" onClick={() => press(key)} disabled={disabled}>
              {key}
            </button>
          )
        })}
      </div>
    </div>
  )
}
