/**
 * Split-tender math for the sale screen — USD and KHR tendered
 * independently in one transaction. Mirrors the backend's integer
 * arithmetic EXACTLY (everything in cent-riel: 1 USD cent = `rate`
 * cent-riel; 1 riel = 100 cent-riel) so the preview the cashier sees can
 * never drift from what PaymentService validates. Display only — the
 * server remains authoritative.
 */
export type SplitTenderResult = {
  /** Combined tender value in USD (for display). */
  totalReceivedUsd: number
  /** True when the combined tender cannot cover the total yet. */
  short: boolean
  /** Remaining amount owed in USD when short. */
  shortByUsd: number
  /** Change owed, in USD. */
  changeUsd: number
  /** Change owed expressed in riel, rounded to the nearest ៛100 (the
   *  smallest denomination commonly used for change — never fractional). */
  changeKhrRounded: number
  /** Whole-riel equivalent of the order total (KHQR hint). */
  totalKhrEquivalent: number
}

export function splitTender(
  totalCents: number,
  usdCents: number,
  khr: number,
  rate: number,
): SplitTenderResult {
  const safeRate = Math.trunc(rate) > 0 ? Math.trunc(rate) : 4100
  const total = Math.max(0, Math.trunc(totalCents))
  const usd = Math.max(0, Math.trunc(usdCents))
  const riel = Math.max(0, Math.trunc(khr))
  const dueCentRiel = total * safeRate
  const tenderCentRiel = usd * safeRate + riel * 100
  const changeCentRiel = Math.max(0, tenderCentRiel - dueCentRiel)
  return {
    totalReceivedUsd: tenderCentRiel / safeRate / 100,
    short: tenderCentRiel < dueCentRiel,
    shortByUsd: Math.max(0, (dueCentRiel - tenderCentRiel) / safeRate / 100),
    changeUsd: changeCentRiel / safeRate / 100,
    changeKhrRounded: Math.round(changeCentRiel / 100 / 100) * 100,
    totalKhrEquivalent: Math.round((total * safeRate) / 100),
  }
}
