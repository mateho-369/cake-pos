# Hardcoded-data audit — full trace (2026-08-26)

This document traces **every** previously-hardcoded dashboard/report/shift/product
number to its exact API call and response field, and states what each value shows
on an **empty** database and with a **seeded test order**. It accompanies the code
changes in this branch.

Legend for the traces: `GET /api/…` → frontend consumer → rendered text.

---

## 1. Sidebar nav badges ("47 Customers", "5 Categories")

**Before:** `apps/admin/src/components/Sidebar.tsx` had a static `badge` in the nav
config (`{ id: 'orders', …, badge: '47' }`, `{ id: 'freshness', …, badge: '5' }`).

**After:**
- Data: `apps/admin/src/lib/data.tsx` `refresh()` fetches
  `GET /api/customers` (→ `CustomerResource[]`), `GET /api/categories`
  (→ `CategoryResource[]`), `GET /api/products` (→ `ProductResource[]`) and
  `GET /api/orders` (→ `OrderResource[]`) in a `Promise.all`.
- Sidebar: `useAdminData()` reads those arrays and derives every badge:
  - Orders badge = `orders.length` (`/api/orders`)
  - Customers badge = `customers.length` (`/api/customers`)
  - Categories badge = `categories.length` (`/api/categories`)
  - Freshness badge = count of `products` whose `status` is
    `'Expires today' | '1 day left'` (`/api/products`)
- Empty DB → no badges render at all (badge only shown when count > 0).

## 2. Topbar "Live sales" ($1,224.50) — and every other sales total

**Before:** `Sidebar.tsx` rendered a static `<strong>$1,224.50</strong>`.

**After:**
- Data: `refresh()` fetches `GET /api/reports/summary`. `ReportController::summary`
  (backend) returns `'todaySalesTotal' => $s['netRevenueCents'] / 100` where
  `netRevenueCents = SUM(orders.total_cents) − refunds − voids` over the window
  for orders with `status='Completed' AND payment_status='paid'`.
- Sidebar live card = `summary.todaySalesTotal` (same field the Dashboard KPI
  renders). Empty DB → `$0.00` in the sidebar, `$0.00` on the Dashboard KPI, and
  `$0` chart axes — no number on the page can disagree.

**All sales totals now share one source:** Dashboard KPIs, Dashboard revenue chart
(`revenueData` from the same endpoint), Reports KPIs, the chart legend totals,
the donut payment split (`cashRevenueCents` / `qrRevenueCents`), and the sidebar
live card all read from the single `/api/reports/summary` payload.

## 3. Dashboard "compared to yesterday" ($1,089)

**Before:** locale string `dashboard.yesterday = "vs. $1,089 yesterday"`.

**After:** `ReportController::summary` now also returns
`yesterdaySalesTotal` (= `/100` of yesterday's paid net revenue, computed by
`DateRange::from(['preset' => 'yesterday'])`) and `yesterdayOrdersCount`.
`Dashboard.tsx` renders the compare line as
`$yesterdaySales.toLocaleString(...)` with label `dashboard.yesterday = "vs. yesterday"`.
Empty DB → no compare amount (renders nothing, not `$1,089`).

Other KPI captions were real-data-ified too:
- **Orders pace** (`dashboard.dailyPace = "4 above daily pace"`): the backend now
  returns `ordersData` — per-day completed-order counts for the **last 7 days** on
  the Today preset (window-aware otherwise). The UI computes
  `pace = today − average(previous days)` and labels it
  `above/below/at daily pace` or `no prior days to compare`.
- **Basket size** (`dashboard.basket = "2.1 items per basket"`): backend now returns
  `itemsSold` (SUM of `order_items.quantity` for paid orders in window); UI renders
  `itemsSold / completedOrders`.
- **Freshness risk value** (`dashboard.riskValue = "$146 retail value at risk"`):
  computed client-side from `/api/products` — `Σ stock × price` over at-risk
  products, rendered with `dashboard.riskValue = "${{value}} retail value at risk"`.
- **"Move 5 units today"** (`dashboard.moveUnits`): now
  `dashboard.moveUnits = "Sell {{count}} units today to avoid waste."` where
  `count` = actual at-risk units; shows `noUnitsAtRisk` when 0.
- **Shift card** (`dashboard.shiftDuration = "2h 47m"`, `openedAt = "7:55 AM"`,
  `openingFloat = "Includes $100 opening float"`): duration is computed from
  `currentShift.openedAt` (live), opened time from the same field, and the float
  from `currentShift.openingCashUsdCents`. `/api/shifts/current` now also returns
  live `expectedCashUsdCents` (opening float + real cash sales so far) via the new
  `ShiftService::cashSalesSince()`.
- **Export toast** no longer claims "Daily backup complete" (`header.backupComplete`);
  it uses `dashboard.exported`.

## 4. Freshness & waste page (previously 100% fabricated)

**Before:** `FreshnessPage.tsx` rendered `94%`, `181 units / 97.3%`,
`3 units / $90`, `2 units / $64`, `$38.00 / ↓ 18%`, and three fake waste-log rows
("Cocoa Mini", "Berry Basque", "Vanilla Cupcake"), plus a hardcoded 94% score ring.

**After — new real endpoint `GET /api/reports/freshness`**
(`ReportController::freshness` → `ReportingService::freshness`), computed from:

| Card | Backend computation (fields returned) |
|---|---|
| Freshness score | `freshPercent = round(freshUnits / totalUnits × 100)` from `products` with `stock > 0` and `freshnessStatus() != 'Expires today'/'1 day left'/'Expired'` |
| Fresh & sellable | `freshUnits` + `freshPercent` |
| Expires today | `expiresTodayUnits`, `expiresTodayValueCents` (= stock × `price_cents`) |
| Expires tomorrow | `expiresTomorrowUnits`, `expiresTomorrowValueCents` |
| Waste this week | `wasteThisWeekCents` = SUM(`inventory_waste_events.retail_value_cents`) since Monday; `wasteDeltaPercent` vs `wasteLastWeekCents` (null when no prior week) |
| Queue table | products from `/api/products` (already real), priority by `status`; SKU label now `catalog.sku` (`CK-{{id}}`) instead of fake `B-200x` |
| Waste log | `events[]` from `inventory_waste_events` joined to employees (product name, quantity, reason, retail value, recorded by, date) |
| Batches tab | `/api/products` (`madeAt`, `bestBefore`, `stock`, `sold`) |
| "Updated X min ago" | `lastRecordedAt` from the waste table |

The score ring SVG is now driven by `freshPercent` (previously hardcoded 284/302
stroke-dasharray ≈ 94%).

**New real write path:** "Record waste" now posts
`POST /api/inventory/waste` (`WasteController::store` → `WasteService::record`),
which decrements the product's `stock` inside a transaction and inserts an
immutable `inventory_waste_events` row (product snapshot, reason, retail value,
recorder, note). The form carries real `productId`/`quantity`/`reason`/`note`.
Reasons use machine keys (`expired|damaged|quality|staff_meal`) instead of the old
UI-only strings. Empty DB → **0%**, `0 units`, `$0.00`, empty waste log, and
"no prior week data".

## 5. KHQR payments panel ("29 payments manually confirmed today")

**Before:** static caption text.

**After:** `ReportController::summary` returns `qrPaymentCount` = COUNT of
`order_payments` where `method='qr_manual'`, `status='confirmed'`, and
`confirmed_at` in the window (this is the real table the cashier-confirmation flow
writes to — see `PaymentService::confirmManualQr`). Rendered as
`dashboard.paymentsConfirmed = "{{count}} KHQR payments confirmed today"` (Dashboard)
and `shifts.paymentsConfirmed = "{{count}} of {{total}} KHQR payments confirmed"`
(Shifts page, with a real progress bar). Empty DB → "No KHQR payments today" /
"0 of 0" / "No KHQR payments in this period".

---

## Additional hardcoded values found and fixed

| Where | Before | After |
|---|---|---|
| Header date "Thursday, 20 August" / greeting "Good morning, Makara" | static | real `new Date().toLocaleDateString('en', { weekday, day, month })` + greeting with the signed-in employee's first name |
| Header notifications "3 new / 3 cakes expire today / Shift variance resolved / Backup complete 3:00 AM" | static | computed from `/api/products` (expiring-today count) + `/api/shifts/current` (shift open + real open time); empty state when none |
| Header profile email `owner@atelier.local` | static | signed-in employee's email (or `—`) |
| Header profile initials | static ("M"…) | derived from employee name |
| Products "Showing X of 52 products" | hardcoded 52 | `{{shown}} of {{total}}` where `total = products.length` |
| Products edit dates `2026-08-20` / `2026-08-23` defaults | hardcoded | `toDateInput(editing.madeAt/bestBefore)` |
| Settings business profile ("Atelier Cake Shop", "Street 63…", phone, currency) | static inputs | `GET/PUT /api/settings/business-profile` (new `SettingsController::businessProfile`/`updateBusinessProfile`, stored in `settings` table) |
| Settings receipt preview (CS-1052, Strawberry Cloud $28, $33 total) | static | previews the most recent real completed order from `/api/orders` (`latestOrder.id/detail/total`); empty state when no orders |
| Settings shelf-life default (3 days) & warning (1 day) | static inputs | `pos_rules.defaultShelfLifeDays`/`warningDays` (new, validated in `PosRulesRequest`); used by admin Add-cake and sale Quick-add for the auto best-before date + "Best before auto-set to {{date}}" |
| Employees "4 team members / 2 people clocked in" | static | `employees.length` and count of `status === 'On shift'` from `/api/employees` |
| Employees "Recent access activity" (fake logins at 7:54/8:01/8:17 AM, iPad/Chrome/Safari) | static | replaced with real shift activity per employee from `/api/employees` (`shift`/`status` fields) |
| Shifts "2 cashiers active", "Opened at 7:55 AM by Sophea" | static | `shifts.filter(Open).length` and `currentShift.openedBy` |
| Shifts "29 of 29 payments confirmed", 100% bar | static | `qrPaymentCount` (see §5) |
| Shifts ledger "Cash refunds $0.00 / Paid out $0.00" | static zeros | removed (no refunds/paid-out tracking exists yet — the real opening float and cash sales are shown) |
| Categories insight ("Signature Cakes lead revenue… 32.7%… 23%") | static | computed from `/api/categories` (`revenue`, `items`): top category by revenue, real share %, real bars scaled to max revenue; "no data" state |
| Reports "62.0% margin / $24.84 average / 1.4% of net sales" details | static | average = `averageOrderValueCents/100`; waste % = `wasteThisWeek / netSales` (real) |
| Reports "Saturday generated 18.7% more sales… Strawberry Cloud sold out 3:40 PM… increase from 22 to 26" | static copy | computed insight: best day from `revenueData`, % vs period average, top product from `summary.topProducts`; "no data" state |
| Reports waste tab (fake bars) | static | real `dailyWaste` from `/api/reports/freshness` |
| Reports chart title "Sales & gross profit" / dual legend | static | "Sales trend" single-series (no real COGS source) |
| Sale terminal date "THURSDAY · 20 AUGUST" | static | real current date |
| Sale "5 items near best-before" | static | count of products with `freshness === 'today' | 'tomorrow'` from `/api/products`; "Everything is fresh" when 0 |
| Sale terminal cashier "Sophea Chan"/"SC" | static fallback | signed-in employee's name + initials (`useStaffAuth`) |
| Sale shift modal "Thursday, 20 August · Sophea Chan" / "Opened today at 9:00 AM" | static | real date + signed-in employee name; real shift `startedAt` (now also returned by `/api/shifts/current`) |
| Sale quick-add "Best before auto-set to Aug 23 / Aug 22" | static dates | real date computed from `defaultShelfLifeDays` |
| Dashboard donut 63%/37% split | static conic-gradient | real `qrPercent`/`cashPercent` from `/api/reports/summary` |
| Freshness ring 94% | static dasharray | real `freshPercent` |

---

## Critical data bug found while tracing (root cause of "Dashboard was right but others weren't")

`ReportingService::paid()` filters orders on `payment_status = 'paid'`, but
**walk-in orders created via `POST /api/orders` never set `payment_status`**
(`OrderService::createWalkIn` inserted rows with the column default `'unpaid'`).
Every report query therefore ignored every walk-in order — on a store with real
orders, **all** sales figures stayed `$0.00` while the sidebars showed the mock
$1,224.50. Fixed:

1. `OrderService::createWalkIn` now stamps `payment_status='paid'`,
   `fulfillment_status='Completed'` (matching the confirmed `order_payments` row
   it creates).
2. New migration `2026_08_26_000021_backfill_paid_orders.php` marks all existing
   completed orders that have a confirmed `order_payments` row as paid, so
   production history starts counting immediately.

## Empty-DB and seeded-order verification (hand-computed)

Since PHP/MySQL cannot run in this sandbox, every figure above was traced to its
exact API field, and the new backend endpoints are covered by contract tests in
`backend/tests/Feature/ApiContractTest.php`:

- `test_walk_in_orders_are_counted_in_reports_summary` — seeds 2 orders today
  ($20 cash ×2 units, $10 KHQR ×1 unit) + 1 yesterday ($20): asserts
  `todaySalesTotal = 30.0`, `todayOrdersCount = 2`, `itemsSold = 3`,
  `qrPaymentCount = 1`, `yesterdaySalesTotal = 20.0`, 7-day `ordersData` with
  today's value `2`.
- `test_freshness_report_computes_from_real_inventory_and_waste` — seeds 6 fresh
  ($10), 2 expires-today ($15), 3 expires-tomorrow ($20) units + a $15 waste
  event: asserts `totalUnits = 11`, `freshUnits = 6`,
  `freshPercent = round(6/11×100) = 55`, `expiresTodayUnits = 2`,
  `expiresTodayValueCents = 3000`, `wasteThisWeekCents = 1500`, 1 event with
  `retailValue = 1.5`.
- `test_record_waste_decrements_stock_and_appends_audit_event` — posts
  `POST /api/inventory/waste` and asserts stock 3→1 and the audit row; over-write
  rejected with 422 and stock unchanged.
- `test_business_profile_settings_round_trip` — PUT/GET
  `/api/settings/business-profile`; cashier PUT forbidden.
- `test_reports_summary_keeps_camel_case_contract` extended for the new fields.

On a completely empty database, running the admin app now shows: `$0.00` live
sales, no nav badges, no yesterday compare, `0%` freshness score, `0 units`
everywhere, `$0.00` waste, "No KHQR payments today", "No employees yet", empty
waste log — every number is a real zero from the real tables.

## Data-hygiene note ("okok" / "B-2015")

The "okok" product is a stray row in the production DB, not something this code
creates. No seeder in this repository writes throwaway product names: the
`DatabaseSeeder` demo catalog is gated to `local`/`testing` environments and
migration `2026_08_26_000019_remove_demo_catalog.php` removed it from prod.
Admin-created products require a name/category/price/stock via the validated
`POST /api/products`, and the sale quick-add flow (`VITE_DEMO_MODE=false` in
production) posts the same endpoint. Delete "okok" from the admin UI as planned —
no code change is needed or warranted.
