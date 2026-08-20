import { useId } from 'react'

export default function Logo({ size = 36, compact = false }: { size?: number; compact?: boolean }) {
  const gid = useId().replace(/:/g, '')
  return (
    <span className="inline-flex items-center gap-2 shrink-0">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="18" fill="rgba(255,255,255,0.85)" />
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F472B6" />
            <stop offset="1" stopColor="#3B82F6" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="28" r="14" fill={`url(#${gid})`} />
        <circle cx="32" cy="28" r="6" fill="#FDF2F6" />
        <rect x="18" y="42" width="28" height="8" rx="4" fill="#BE185D" />
      </svg>
      {!compact && (
        <span className="leading-none">
          <span className="block text-[0.95rem] font-semibold tracking-tight">Bloom</span>
          <span className="block text-[0.62rem] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--ink-3)' }}>
            Cake atelier
          </span>
        </span>
      )}
    </span>
  )
}
