/**
 * Resolve the displayed start time for an open shift without ever silently
 * inventing "now".
 *
 * The shift API returns `startedAt` as a pre-formatted `g:i A` string, and
 * `openedAt` as an ISO timestamp. If both are missing the response is
 * malformed; callers should surface an honest "start time unavailable" state
 * and log it rather than showing a plausible-looking current time on every
 * poll.
 */
export function formatShiftStartedAt(
  startedAt?: string,
  openedAt?: string,
): string | null {
  if (startedAt) return startedAt
  if (!openedAt) return null
  const date = new Date(openedAt)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
