# Reporting contract

Reporting is admin-only and uses `DateRange`, whose preset/custom boundaries are local `Asia/Phnom_Penh` days converted to UTC before querying MySQL. Financial values are integer USD cents; KHR tender remains integer riel and is never reconverted with the current rate. Payment reports use the exchange-rate snapshot on each payment.

Endpoints: `/api/reports/dashboard`, `/sales-summary`, `/revenue-trend`, `/products`, `/categories`, `/payments`, `/cashiers`, `/peak-hours`, `/waste`, and `/customers`. All accept `preset`, `from`, `to`, `timezone`, `granularity`, `limit`, and `sort` where relevant.

Definitions:

- Gross sales = completed order item/order subtotals before discounts.
- Discounts = completed order discount cents.
- Net sales before corrections = gross minus discounts.
- Refunds and voids = linked negative correction amounts.
- Net revenue = paid completed totals plus negative corrections.
- Order count excludes held, pending, cancelled, and failed payments.
- Average order value is net revenue divided by completed paid orders, or zero.

Historical product/category snapshots on `order_items` are used for rankings. Order-level discounts are allocated proportionally with integer division and the final line receives the remainder, guaranteeing exact totals. Peak hours convert UTC timestamps to Phnom Penh local time. Empty trend buckets are returned as zero values. Waste events are explicit records and are not inferred from current inventory.

## Transaction detail (drill-down)

Summary rollups alone are not a report: the Reports page also renders a
transaction-detail table — one row per order in the selected range (date and
time, order id, source, customer/cashier, item count and lines, payment
method, total, status), sortable by every column and paginated 25/50/100/All
with a `Showing X–Y of Z` counter. It is fed by the same date range/preset as
the KPIs, charts and exports above it, so changing "This month" → "Last
month" moves the detail list with everything else. The Sales, Products,
Payments and Team tabs share this one list (each opening on the sort that
matches its question); Waste, Losses and the Audit log keep their own
event-level detail.
