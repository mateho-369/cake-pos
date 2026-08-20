import { Minus, Plus } from 'lucide-react'

export default function QtyStepper({
  value,
  onChange,
  min = 0,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full px-1 py-1 glass-soft">
      <button
        type="button"
        className="grid h-8 w-8 place-items-center rounded-full"
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Decrease"
      >
        <Minus size={14} />
      </button>
      <span className="tabular w-6 text-center text-sm font-semibold">{value}</span>
      <button
        type="button"
        className="grid h-8 w-8 place-items-center rounded-full"
        onClick={() => onChange(value + 1)}
        aria-label="Increase"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
