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
