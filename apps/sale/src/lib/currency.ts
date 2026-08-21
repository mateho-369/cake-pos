/** Display-only mirror of the backend integer conversion. Settlement is always server-authoritative. */
export function usdCentsToKhr(usdCents: number, rate: number, increment = 100) {
  const exact = Math.trunc(usdCents) * Math.trunc(rate)
  const unit = Math.trunc(increment) * 100
  const khr = Math.floor((exact + Math.floor(unit / 2)) / unit) * increment
  return { khr, settlementRoundingKhr: khr - Math.floor(exact / 100) }
}
