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

  const back = () => {
    if (disabled) return
    onChange(value.slice(0, -1))
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

  return (
    <div>
      <div className="mb-6 flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-3.5 w-3.5 rounded-full transition-all"
            style={{
              background: i < value.length ? 'linear-gradient(180deg, #F9A8D4, #F472B6)' : 'rgba(59,10,31,0.12)',
              transform: i < value.length ? 'scale(1.15)' : 'scale(1)',
              boxShadow: i < value.length ? '0 6px 14px rgba(244,114,182,0.45)' : 'none',
            }}
          />
        ))}
      </div>
      <div className="mx-auto grid max-w-[280px] grid-cols-3 gap-3">
        {keys.map((key) => {
          if (key === '') return <span key="empty" />
          if (key === 'del') {
            return (
              <button key="del" type="button" className="pin-key" onClick={back} aria-label="Delete" disabled={disabled}>
                <Delete size={22} className="mx-auto" />
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
