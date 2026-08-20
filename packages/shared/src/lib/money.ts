export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export const parseMoney = (raw: string) => {
  const n = Number(raw.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export const pad = (n: number) => String(n).padStart(2, '0')

export function localISODate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(iso: string, days: number) {
  const [y, m, day] = iso.split('-').map(Number)
  const d = new Date(y, m - 1, day)
  d.setDate(d.getDate() + days)
  return localISODate(d)
}

export function daysUntil(iso: string, from = localISODate()) {
  const a = new Date(from + 'T00:00:00')
  const b = new Date(iso + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function formatDay(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

export function duration(fromIso: string, to = new Date()) {
  const ms = to.getTime() - new Date(fromIso).getTime()
  const mins = Math.max(0, Math.floor(ms / 60_000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h <= 0) return `${m}m`
  return `${h}h ${m}m`
}

export function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
