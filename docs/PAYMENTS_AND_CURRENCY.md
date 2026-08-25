# Payments, currency, and order state

All accounting values are integers: USD is cents, KHR is riel, and rates are riel per USD. The backend reads `pos_rules.exchangeRateKhrPerUsd` and `pos_rules.khrRoundingIncrement` for every settlement.

For `usdCents` and `rate`, conversion uses integer cent-riel arithmetic:

```
exactCentRiel = usdCents * rate
roundedKhr = floor((exactCentRiel + floor(increment * 100 / 2)) / (increment * 100)) * increment
```

This is half-up rounding. Tender comparison uses the common numerator `usdCents * rate + khr * 100`; no floating point is used. A payment snapshots its rate and records any denomination adjustment in `settlementRoundingKhr`.

## State machine

Payment status is `unpaid`, `pending`, `paid`, `refunded`; workflow status is `Pending`, `Confirmed`, `Held`, `Paid`, `Ready`, `Completed`, `Cancelled`, `Refunded`, or `Voided`. A walk-in hold reserves stock but is not revenue. Cash or explicitly confirmed manual QR creates an immutable confirmed `order_payments` ledger row. Paying a hold atomically releases its reservation and sells stock once. Cancelling releases the reservation without revenue.

`qr_manual` displays the configured KHQR image (served from object storage) and requires cashier confirmation; it never changes a drawer. Reserved strategy codes (`khqr_bakong_api`, `khqr_aba_api`, `card`, `bank_transfer`) are intentionally not integrated.

A store has one backend-authoritative open shift. USD and KHR drawer totals and variances are always calculated independently. Completed orders and confirmed payments are immutable; corrections are linked records.
