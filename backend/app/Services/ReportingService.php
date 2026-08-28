<?php
namespace App\Services;
use App\Reporting\DateRange;
use App\Models\{
    AuditEvent,
    Customer,
    Employee,
    Order,
    OrderItem,
    OrderPayment,
    Product,
    Shift,
};
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Carbon\CarbonImmutable;
final class ReportingService
{
    private function paid(DateRange $r)
    {
        // Every column is explicitly qualified with `orders.` because callers
        // (e.g. cashiers()) join other tables that carry same-named columns —
        // `employees.created_at` made an unqualified `created_at` ambiguous
        // and 500'd /api/reports/cashiers in production.
        return Order::query()
            ->where('orders.status', 'Completed')
            ->where('orders.payment_status', 'paid')
            ->whereBetween('orders.created_at', [$r->from, $r->to]);
    }
    public function summary(array $input): array
    {
        $r = DateRange::from($input);
        return Cache::remember(
            'report:summary:' . $r->from . $r->to,
            45,
            function () use ($r) {
                $q = $this->paid($r);
                $x = $q
                    ->selectRaw(
                        'COALESCE(SUM(subtotal_cents),0) gross,COALESCE(SUM(discount_amount_cents),0) discounts,COALESCE(SUM(total_cents),0) net,COUNT(*) count',
                    )
                    ->first();
                $corr = Order::whereIn('status', ['Refunded', 'Voided'])
                    ->whereBetween('created_at', [$r->from, $r->to])
                    ->selectRaw('COALESCE(SUM(-total_cents),0) amount')
                    ->value('amount');
                $gross = (int) $x->gross;
                $discount = (int) $x->discounts;
                $net = (int) $x->net;
                $yesterday = DateRange::from(['preset' => 'yesterday']);
                $y = $this->paid($yesterday)
                    ->selectRaw(
                        'COALESCE(SUM(total_cents),0) net,COUNT(*) count',
                    )
                    ->first();
                $itemsSold = OrderItem::join(
                    'orders',
                    'orders.id',
                    '=',
                    'order_items.order_id',
                )
                    ->where('orders.status', 'Completed')
                    ->where('orders.payment_status', 'paid')
                    ->whereBetween('orders.created_at', [$r->from, $r->to])
                    ->sum('order_items.quantity');
                // For a single-day window (the "today" dashboard preset) the
                // per-day order series still spans the last 7 days so the UI
                // can compare today's pace against the previous six days.
                $paceRange = $r->from->eq($r->to)
                    ? new DateRange($r->to->subDays(6), $r->to)
                    : $r;
                return [
                    'grossSalesCents' => $gross,
                    'totalDiscountsCents' => $discount,
                    'netSalesBeforeCorrectionsCents' => $gross - $discount,
                    'refundsCents' => Order::where('status', 'Refunded')
                        ->whereBetween('created_at', [$r->from, $r->to])
                        ->sum(DB::raw('-total_cents')),
                    'voidsCents' => Order::where('status', 'Voided')
                        ->whereBetween('created_at', [$r->from, $r->to])
                        ->sum(DB::raw('-total_cents')),
                    'netRevenueCents' => $net - (int) $corr,
                    'completedOrderCount' => (int) $x->count,
                    'heldOrderCount' => Order::where('status', 'Held')
                        ->whereBetween('created_at', [$r->from, $r->to])
                        ->count(),
                    'averageOrderValueCents' => $x->count
                        ? (int) intdiv($net - (int) $corr, $x->count)
                        : 0,
                    'cashRevenueCents' => $this->paid($r)
                        ->where('payment', 'Cash')
                        ->sum('total_cents'),
                    'qrRevenueCents' => $this->paid($r)
                        ->where('payment', 'KHQR')
                        ->sum('total_cents'),
                    'yesterdaySalesTotal' => (int) ($y->net ?? 0) / 100,
                    'yesterdayOrdersCount' => (int) ($y->count ?? 0),
                    'itemsSold' => (int) $itemsSold,
                    'qrPaymentCount' => OrderPayment::where(
                        'method',
                        'qr_manual',
                    )
                        ->where('status', 'confirmed')
                        ->whereBetween('confirmed_at', [$r->from, $r->to])
                        ->count(),
                    'ordersData' => $this->ordersTrend($paceRange),
                ];
            },
        );
    }
    private function ordersTrend(DateRange $r): array
    {
        $rows = $this->paid($r)
            ->selectRaw(
                "DATE_FORMAT(CONVERT_TZ(orders.created_at,'UTC','Asia/Phnom_Penh'),'%Y-%m-%d') bucket,COUNT(*) count",
            )
            ->groupBy('bucket')
            ->pluck('count', 'bucket');
        $out = [];
        // DateRange returns UTC bounds; the SQL above buckets by the shop
        // timezone, so iterate in the same timezone or the last bucket before
        // midnight local is labelled with yesterday's UTC date (and the order
        // looks like it landed on the wrong day).
        $cursor = $r->from->copy()->tz('Asia/Phnom_Penh');
        $to = $r->to->copy()->tz('Asia/Phnom_Penh');
        while ($cursor <= $to) {
            $key = $cursor->format('Y-m-d');
            $out[] = [
                'day' => $key,
                'value' => (int) ($rows[$key] ?? 0),
            ];
            $cursor = $cursor->addDay();
        }
        return $out;
    }
    public function trend(array $input): array
    {
        $r = DateRange::from($input);
        $format =
            ($input['granularity'] ?? 'day') === 'month' ? '%Y-%m' : '%Y-%m-%d';
        $rows = $this->paid($r)
            ->selectRaw(
                "DATE_FORMAT(CONVERT_TZ(orders.created_at,'UTC','Asia/Phnom_Penh'),?) bucket,SUM(orders.subtotal_cents) gross,SUM(orders.discount_amount_cents) discounts,SUM(orders.total_cents) net",
                [$format],
            )
            ->groupBy('bucket')
            ->pluck('net', 'bucket');
        $out = [];
        // Same timezone alignment as ordersTrend().
        $cursor = $r->from->copy()->tz('Asia/Phnom_Penh');
        $to = $r->to->copy()->tz('Asia/Phnom_Penh');
        while ($cursor <= $to) {
            $key = $cursor->format($format === '%Y-%m' ? 'Y-m' : 'Y-m-d');
            $out[] = [
                'period' => $key,
                'netRevenueCents' => (int) ($rows[$key] ?? 0),
            ];
            $cursor =
                $format === '%Y-%m' ? $cursor->addMonth() : $cursor->addDay();
        }
        return $out;
    }
    public function payments(array $input): array
    {
        $r = DateRange::from($input);
        return OrderPayment::where('status', 'confirmed')
            ->whereBetween('confirmed_at', [$r->from, $r->to])
            ->select('method')
            ->selectRaw(
                'COUNT(*) transactions,SUM(amount_usd_cents) amount_usd_cents,SUM(COALESCE(tendered_usd_cents,0)) tendered_usd_cents,SUM(COALESCE(tendered_khr,0)) tendered_khr,SUM(COALESCE(change_usd_cents,0)) change_usd_cents,SUM(COALESCE(change_khr,0)) change_khr,SUM(settlement_rounding_khr) settlement_rounding_khr',
            )
            ->groupBy('method')
            ->get()
            ->toArray();
    }
    public function products(array $input): array
    {
        $r = DateRange::from($input);
        $limit = $input['limit'] ?? 10;
        return OrderItem::join(
            'orders',
            'orders.id',
            '=',
            'order_items.order_id',
        )
            ->where('orders.status', 'Completed')
            ->whereBetween('orders.created_at', [$r->from, $r->to])
            ->select(
                'order_items.product_id',
                'order_items.description as snapshotName',
                'order_items.category_snapshot',
            )
            ->selectRaw(
                'SUM(quantity) quantity,SUM(line_subtotal_cents) grossRevenueCents,SUM(line_discount_cents) discountsCents,SUM(line_total_cents) netRevenueCents',
            )
            ->groupBy(
                'order_items.product_id',
                'order_items.description',
                'order_items.category_snapshot',
            )
            ->orderByDesc('netRevenueCents')
            ->limit($limit)
            ->get()
            ->toArray();
    }
    public function categories(array $input): array
    {
        $r = DateRange::from($input);
        return OrderItem::join(
            'orders',
            'orders.id',
            '=',
            'order_items.order_id',
        )
            ->where('orders.status', 'Completed')
            ->whereBetween('orders.created_at', [$r->from, $r->to])
            ->selectRaw(
                "COALESCE(NULLIF(category_snapshot,''),'Unknown / archived') category,SUM(quantity) units,SUM(line_total_cents) netRevenueCents",
            )
            ->groupBy('category_snapshot')
            ->get()
            ->toArray();
    }
    public function peakHours(array $input): array
    {
        $r = DateRange::from($input);
        return $this->paid($r)
            ->selectRaw(
                'HOUR(CONVERT_TZ(orders.created_at,"UTC","Asia/Phnom_Penh")) hour,COUNT(*) orders,SUM(orders.total_cents) revenueCents',
            )
            ->groupBy('hour')
            ->orderBy('hour')
            ->get()
            ->toArray();
    }
    /**
     * Per-employee accountability report: normal sales numbers PLUS the
     * anti-theft signals — discounts given, voids/refunds issued, and the
     * full cash-variance history across shifts in the range (a pattern of
     * repeated negative variance is flagged for the owner).
     */
    public function cashiers(array $input): array
    {
        $r = DateRange::from($input);
        $sales = $this->paid($r)
            ->join('employees', 'employees.id', '=', 'orders.cashier_id')
            ->selectRaw(
                'orders.cashier_id,employees.name,COUNT(*) completedOrderCount,SUM(orders.total_cents) netRevenueCents,SUM(orders.discount_amount_cents) discountsCents',
            )
            ->groupBy('orders.cashier_id', 'employees.name')
            ->get()
            ->keyBy('cashier_id');

        $discountCounts = Order::where('orders.status', 'Completed')
            ->where('orders.payment_status', 'paid')
            ->where('orders.discount_amount_cents', '>', 0)
            ->whereBetween('orders.created_at', [$r->from, $r->to])
            ->whereNotNull('orders.cashier_id')
            ->selectRaw('orders.cashier_id, COUNT(*) cnt')
            ->groupBy('orders.cashier_id')
            ->pluck('cnt', 'cashier_id');

        $corrections = Order::whereIn('status', ['Voided', 'Refunded'])
            ->whereBetween('created_at', [$r->from, $r->to])
            ->whereNotNull('cashier_id')
            ->selectRaw(
                'cashier_id, status, COUNT(*) cnt, COALESCE(SUM(-total_cents),0) amount',
            )
            ->groupBy('cashier_id', 'status')
            ->get();

        $shifts = Shift::where('status', 'Closed')
            ->whereBetween('closed_at', [$r->from, $r->to])
            ->whereNotNull('closed_by_employee_id')
            ->orderBy('closed_at')
            ->get()
            ->groupBy('closed_by_employee_id');

        $ids = collect()
            ->merge($sales->keys())
            ->merge($discountCounts->keys())
            ->merge($corrections->pluck('cashier_id'))
            ->merge($shifts->keys())
            ->unique()
            ->values();
        $names = Employee::whereIn('id', $ids)->pluck('name', 'id');

        return $ids
            ->map(function ($id) use (
                $sales,
                $discountCounts,
                $corrections,
                $shifts,
                $names,
            ) {
                $row = $sales->get($id);
                $void = $corrections->first(
                    fn($c) => (int) $c->cashier_id === (int) $id &&
                        $c->status === 'Voided',
                );
                $refund = $corrections->first(
                    fn($c) => (int) $c->cashier_id === (int) $id &&
                        $c->status === 'Refunded',
                );
                $history = collect($shifts->get($id, []))
                    ->map(
                        fn($s) => [
                            'closedAt' => $s->closed_at?->toISOString(),
                            'openingCashUsdCents' =>
                                (int) $s->opening_cash_usd_cents,
                            'expectedCashUsdCents' =>
                                (int) $s->expected_cash_usd_cents,
                            'closingCashUsdCents' =>
                                (int) $s->closing_cash_usd_cents,
                            'varianceUsdCents' => (int) $s->variance_usd_cents,
                        ],
                    )
                    ->values();
                $shortfallCount = $history
                    ->filter(fn($s) => $s['varianceUsdCents'] < 0)
                    ->count();
                return [
                    'cashier_id' => (int) $id,
                    'name' =>
                        $row->name ?? ($names->get($id) ?? "Employee #$id"),
                    'completedOrderCount' =>
                        (int) ($row->completedOrderCount ?? 0),
                    'netRevenueCents' => (int) ($row->netRevenueCents ?? 0),
                    'discountsCents' => (int) ($row->discountsCents ?? 0),
                    'discountCount' => (int) ($discountCounts->get($id) ?? 0),
                    'voidCount' => (int) ($void->cnt ?? 0),
                    'voidAmountCents' => (int) ($void->amount ?? 0),
                    'refundCount' => (int) ($refund->cnt ?? 0),
                    'refundAmountCents' => (int) ($refund->amount ?? 0),
                    'shiftsClosed' => $history->count(),
                    'shortfallCount' => $shortfallCount,
                    // Two or more cash-short closes in the range = a pattern
                    // worth investigating.
                    'repeatedShortfall' => $shortfallCount >= 2,
                    'varianceHistory' => $history->all(),
                ];
            })
            ->sortByDesc('netRevenueCents')
            ->values()
            ->all();
    }

    /**
     * The employee-accountability audit trail (who did what, before/after,
     * when), newest first, filterable by employee and by action prefix.
     */
    public function audit(array $input): array
    {
        $r = DateRange::from($input);
        $q = AuditEvent::whereBetween('created_at', [$r->from, $r->to]);
        if (!empty($input['employee'])) {
            $q->where('employee_id', (int) $input['employee']);
        }
        if (!empty($input['action'])) {
            $q->where('action', 'like', $input['action'] . '%');
        }
        if (!empty($input['productId'])) {
            $q->whereRaw(
                "JSON_UNQUOTE(JSON_EXTRACT(details_json, '$.productId')) = ?",
                [(string) (int) $input['productId']],
            );
        }
        return $q
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(500)
            ->get()
            ->map(
                fn($e) => [
                    'id' => $e->id,
                    'at' => $e->created_at->toISOString(),
                    'employee' => $e->employee_name_snapshot,
                    'employeeId' => $e->employee_id,
                    'action' => $e->action,
                    'orderId' => $e->order_id,
                    'details' => $e->details_json ?? [],
                    'ip' => $e->ip,
                ],
            )
            ->values()
            ->toArray();
    }

    /**
     * Repeat-customer / retention tracking over the range: how many distinct
     * customers ordered, how many are new vs returning, and who orders again.
     */
    public function retention(array $input): array
    {
        $r = DateRange::from($input);
        $byCustomer = Order::whereBetween('created_at', [$r->from, $r->to])
            ->whereNull('parent_order_id')
            ->whereNotIn('status', ['Cancelled'])
            ->whereNotNull('customer_id')
            ->selectRaw('customer_id, COUNT(*) cnt')
            ->groupBy('customer_id')
            ->get();
        $customers = Customer::whereIn('id', $byCustomer->pluck('customer_id'))
            ->get()
            ->keyBy('id');
        $rows = [];
        $new = 0;
        $returning = 0;
        foreach ($byCustomer as $row) {
            $customer = $customers->get((int) $row->customer_id);
            $firstSeen = $customer?->first_seen_at;
            $isNew =
                $firstSeen &&
                $firstSeen->gte($r->from) &&
                $firstSeen->lte($r->to);
            $isNew ? $new++ : $returning++;
            $rows[] = [
                'customerId' => (int) $row->customer_id,
                'name' => $customer?->name ?? 'Unknown',
                'ordersInRange' => (int) $row->cnt,
                'firstSeenAt' => $firstSeen?->toISOString(),
                'isNew' => (bool) $isNew,
                'totalOrders' => (int) ($customer
                    ? Order::where('customer_id', $customer->id)
                        ->whereNull('parent_order_id')
                        ->whereNotIn('status', ['Cancelled'])
                        ->count()
                    : 0),
            ];
        }
        usort($rows, fn($a, $b) => $b['ordersInRange'] <=> $a['ordersInRange']);
        $total = count($rows);
        return [
            'customersWithOrders' => $total,
            'newCustomers' => $new,
            'returningCustomers' => $returning,
            'repeatRatePercent' => $total
                ? round(($returning / $total) * 100)
                : 0,
            'repeatCustomers' => collect($rows)
                ->filter(
                    fn($row) => $row['ordersInRange'] >= 2 || !$row['isNew'],
                )
                ->count(),
            'customers' => array_slice($rows, 0, 25),
        ];
    }
    public function waste(array $input): array
    {
        $r = DateRange::from($input);
        return DB::table('inventory_waste_events')
            ->whereBetween('recorded_at', [$r->from, $r->to])
            ->selectRaw(
                'reason,SUM(quantity) units,SUM(retail_value_cents) retailValueCents',
            )
            ->groupBy('reason')
            ->get()
            ->toArray();
    }

    /**
     * Freshness & waste overview, computed entirely from the real product
     * inventory and the inventory_waste_events audit table. No hardcoded
     * counts: on an empty store every figure here is zero.
     */
    public function freshness(array $input): array
    {
        $r = DateRange::from($input);
        $totalUnits = 0;
        $freshUnits = 0;
        $freshValueCents = 0;
        $expiresTodayUnits = 0;
        $expiresTodayValueCents = 0;
        $expiresTomorrowUnits = 0;
        $expiresTomorrowValueCents = 0;
        $expiredUnits = 0;
        $expiredValueCents = 0;
        foreach (
            Product::all(['id', 'price_cents', 'stock', 'best_before'])
            as $product
        ) {
            $units = (int) $product->stock;
            if ($units <= 0) {
                continue;
            }
            $value = $units * (int) $product->price_cents;
            $totalUnits += $units;
            match ($product->freshnessStatus()) {
                'Expires today' => [
                    ($expiresTodayUnits += $units),
                    ($expiresTodayValueCents += $value),
                ],
                '1 day left' => [
                    ($expiresTomorrowUnits += $units),
                    ($expiresTomorrowValueCents += $value),
                ],
                'Expired' => [
                    ($expiredUnits += $units),
                    ($expiredValueCents += $value),
                ],
                default => [
                    ($freshUnits += $units),
                    ($freshValueCents += $value),
                ],
            };
        }
        $tz = $input['timezone'] ?? 'Asia/Phnom_Penh';
        $now = CarbonImmutable::now($tz);
        $weekStart = $now->startOfWeek();
        $thisWeekCents = (int) DB::table('inventory_waste_events')
            ->whereBetween('recorded_at', [$weekStart, $now])
            ->sum('retail_value_cents');
        $lastWeekCents = (int) DB::table('inventory_waste_events')
            ->whereBetween('recorded_at', [
                $weekStart->subWeek(),
                $weekStart->subSecond(),
            ])
            ->sum('retail_value_cents');
        $dailyRows = DB::table('inventory_waste_events')
            ->whereBetween('recorded_at', [$r->from, $r->to])
            ->selectRaw(
                "DATE_FORMAT(CONVERT_TZ(recorded_at,'UTC','Asia/Phnom_Penh'),'%Y-%m-%d') day,SUM(retail_value_cents) value",
            )
            ->groupBy('day')
            ->pluck('value', 'day');
        $daily = [];
        $cursor = $r->from;
        while ($cursor <= $r->to) {
            $key = $cursor->format('Y-m-d');
            $daily[] = [
                'day' => $key,
                'value' => (int) ($dailyRows[$key] ?? 0) / 100,
            ];
            $cursor = $cursor->addDay();
        }
        $events = DB::table('inventory_waste_events')
            ->leftJoin(
                'employees',
                'employees.id',
                '=',
                'inventory_waste_events.recorded_by_employee_id',
            )
            ->whereBetween('inventory_waste_events.recorded_at', [
                $r->from,
                $r->to,
            ])
            ->orderByDesc('inventory_waste_events.recorded_at')
            ->limit(50)
            ->get([
                'inventory_waste_events.id',
                'inventory_waste_events.product_name_snapshot',
                'inventory_waste_events.category_snapshot',
                'inventory_waste_events.quantity',
                'inventory_waste_events.reason',
                'inventory_waste_events.retail_value_cents',
                'inventory_waste_events.recorded_at',
                'employees.name as recorded_by',
            ])
            ->map(
                fn($row) => [
                    'id' => (int) $row->id,
                    'productName' => $row->product_name_snapshot,
                    'category' => $row->category_snapshot,
                    'quantity' => (int) $row->quantity,
                    'reason' => $row->reason,
                    'retailValue' => (int) $row->retail_value_cents / 100,
                    'recordedAt' => $row->recorded_at,
                    'recordedBy' => $row->recorded_by,
                ],
            )
            ->values()
            ->all();
        return [
            'totalUnits' => $totalUnits,
            'freshUnits' => $freshUnits,
            'freshValueCents' => $freshValueCents,
            'freshPercent' => $totalUnits
                ? round(($freshUnits / $totalUnits) * 100)
                : 0,
            'expiresTodayUnits' => $expiresTodayUnits,
            'expiresTodayValueCents' => $expiresTodayValueCents,
            'expiresTomorrowUnits' => $expiresTomorrowUnits,
            'expiresTomorrowValueCents' => $expiresTomorrowValueCents,
            'expiredUnits' => $expiredUnits,
            'expiredValueCents' => $expiredValueCents,
            'wasteThisWeekCents' => $thisWeekCents,
            'wasteLastWeekCents' => $lastWeekCents,
            'wasteDeltaPercent' =>
                $lastWeekCents > 0
                    ? round(
                        (($thisWeekCents - $lastWeekCents) / $lastWeekCents) *
                            100,
                        1,
                    )
                    : null,
            'dailyWaste' => $daily,
            'events' => $events,
            'lastRecordedAt' => DB::table('inventory_waste_events')->max(
                'recorded_at',
            ),
        ];
    }
    public function customers(array $input): array
    {
        $r = DateRange::from($input);
        return $this->paid($r)
            ->whereNotNull('orders.customer_id')
            ->selectRaw(
                'orders.customer_id,COUNT(*) orders,SUM(orders.total_cents) netRevenueCents,MAX(orders.created_at) lastOrderAt',
            )
            ->groupBy('orders.customer_id')
            ->orderByDesc('netRevenueCents')
            ->limit($input['limit'] ?? 25)
            ->get()
            ->toArray();
    }
}
