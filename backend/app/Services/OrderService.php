<?php

namespace App\Services;

use App\Data\CreatedOrder;
use App\Models\{
    Employee,
    Order,
    OrderItem,
    Product,
    Setting,
    OrderPayment,
    OrderStatusEvent,
};
use App\Support\ExchangeRate;
use App\Support\Money;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderService
{
    public function createWalkIn(array $input, Employee $employee): CreatedOrder
    {
        $key = $input['idempotencyKey'] ?? null;
        if (
            $key &&
            ($existing = Order::where('idempotency_key', $key)->first())
        ) {
            return $this->existingIdempotentOrder($existing, $employee);
        }

        try {
            $order = DB::transaction(function () use ($input, $employee, $key) {
                $lines = $this->lockRequestedProducts($input['items']);
                $subtotal = collect($lines)->sum(
                    fn($line) => $line[0]->price_cents * $line[1],
                );
                [
                    $discountType,
                    $discountValue,
                    $discountAmount,
                ] = $this->calculateDiscount(
                    $input['discount'] ?? null,
                    $subtotal,
                    $employee,
                );
                $total = max(0, $subtotal - $discountAmount);

                $order = Order::create([
                    'id' => 'CS-' . $this->nextOrderNumber(),
                    'cashier_id' => $employee->id,
                    'idempotency_key' => $key,
                    'source' => 'walk-in',
                    'time' => now()->format('g:i A'),
                    'date' => 'Today',
                    'items' => collect($lines)->sum(fn($line) => $line[1]),
                    'subtotal_cents' => $subtotal,
                    'discount_type' => $discountType,
                    'discount_value' => $discountValue,
                    'discount_amount_cents' => $discountAmount,
                    'total_cents' => $total,
                    'payment' =>
                        strtolower($input['payment']) === 'cash'
                            ? 'Cash'
                            : 'KHQR',
                    'status' => 'Completed',
                    'detail_json' => collect($lines)
                        ->map(fn($line) => $line[0]->name . ' × ' . $line[1])
                        ->all(),
                ]);

                $allocated = 0;
                $lineIndex = 0;
                $lineCount = count($lines);
                foreach ($lines as [$product, $quantity]) {
                    $lineSubtotal = $product->price_cents * $quantity;
                    $lineDiscount =
                        ++$lineIndex === $lineCount
                            ? $discountAmount - $allocated
                            : intdiv(
                                $discountAmount * $lineSubtotal,
                                max(1, $subtotal),
                            );
                    $allocated += $lineDiscount;
                    $product->decrement('stock', $quantity);
                    OrderItem::create([
                        'order_id' => $order->id,
                        'product_id' => $product->id,
                        'description' => $product->name,
                        'category_snapshot' => $product->category?->name,
                        'quantity' => $quantity,
                        'unit_price_cents' => $product->price_cents,
                        'line_subtotal_cents' => $lineSubtotal,
                        'line_discount_cents' => $lineDiscount,
                        'line_total_cents' => $lineSubtotal - $lineDiscount,
                    ]);
                }
                $this->recordNetProductRevenue($lines, $subtotal, $total);
                $method =
                    strtolower($input['payment']) === 'cash'
                        ? 'cash'
                        : 'qr_manual';
                if ($method === 'qr_manual' && empty($input['confirmed'])) {
                    throw ValidationException::withMessages([
                        'confirmed' => ['Cashier confirmation is required'],
                    ]);
                }
                OrderPayment::create([
                    'order_id' => $order->id,
                    'method' => $method,
                    'status' => 'confirmed',
                    'amount_usd_cents' => $total,
                    'exchange_rate_khr_per_usd' => ExchangeRate::current(),
                    'tendered_usd_cents' =>
                        $method === 'cash'
                            ? $input['usdReceivedCents'] ?? $total
                            : null,
                    'tendered_khr' =>
                        $method === 'cash' ? $input['khrReceived'] ?? 0 : null,
                    'change_usd_cents' =>
                        $method === 'cash'
                            ? $input['changeUsdCents'] ?? 0
                            : null,
                    'change_khr' =>
                        $method === 'cash' ? $input['changeKhr'] ?? 0 : null,
                    'confirmed_by_employee_id' => $employee->id,
                    'confirmed_at' => now(),
                ]);
                return $order;
            });
        } catch (QueryException $exception) {
            // Two retries can pass the initial lookup simultaneously. The unique
            // index chooses the winner; the loser returns that committed order.
            if ($key && $exception->getCode() === '23000') {
                $original = Order::where('idempotency_key', $key)
                    ->where('cashier_id', $employee->id)
                    ->first();
                if ($original) {
                    return new CreatedOrder($original, false);
                }
            }
            throw $exception;
        }

        return new CreatedOrder($order, true);
    }

    public function hold(array $input, Employee $employee): Order
    {
        $key = $input['idempotencyKey'] ?? null;
        if ($key && ($old = Order::where('idempotency_key', $key)->first())) {
            return $old;
        }
        return DB::transaction(function () use ($input, $employee, $key) {
            $lines = $this->lockRequestedProducts($input['items'], true);
            $subtotal = collect($lines)->sum(
                fn($l) => $l[0]->price_cents * $l[1],
            );
            [$type, $value, $discount] = $this->calculateDiscount(
                $input['discount'] ?? null,
                $subtotal,
                $employee,
            );
            $total = max(0, $subtotal - $discount);
            $order = Order::create([
                'id' => 'CS-' . $this->nextOrderNumber(),
                'cashier_id' => $employee->id,
                'idempotency_key' => $key,
                'source' => 'walk-in',
                'time' => now()->format('g:i A'),
                'date' => 'Today',
                'items' => collect($lines)->sum(fn($l) => $l[1]),
                'subtotal_cents' => $subtotal,
                'discount_type' => $type,
                'discount_value' => $value,
                'discount_amount_cents' => $discount,
                'total_cents' => $total,
                'payment' => null,
                'status' => 'Held',
                'payment_status' => 'unpaid',
                'fulfillment_status' => 'Held',
                'detail_json' => collect($lines)
                    ->map(fn($l) => $l[0]->name . ' × ' . $l[1])
                    ->all(),
            ]);
            OrderStatusEvent::create([
                'order_id' => $order->id,
                'to_status' => 'Held',
                'employee_id' => $employee->id,
            ]);
            foreach ($lines as [$product, $quantity]) {
                $product->increment('reserved_stock', $quantity);
                OrderItem::create([
                    'order_id' => $order->id,
                    'product_id' => $product->id,
                    'description' => $product->name,
                    'category_snapshot' => $product->category?->name,
                    'quantity' => $quantity,
                    'unit_price_cents' => $product->price_cents,
                    'line_subtotal_cents' => $product->price_cents * $quantity,
                    'line_total_cents' => $product->price_cents * $quantity,
                ]);
            }
            return $order;
        });
    }
    public function cancel(Order $order): void
    {
        DB::transaction(function () use ($order) {
            $order = Order::whereKey($order->id)
                ->lockForUpdate()
                ->firstOrFail();
            if ($order->status !== 'Held') {
                $this->conflict('Only unpaid Held orders can be cancelled');
            }
            foreach ($order->orderItems()->lockForUpdate()->get() as $item) {
                if ($item->product_id) {
                    Product::whereKey($item->product_id)
                        ->lockForUpdate()
                        ->first()
                        ?->decrement('reserved_stock', $item->quantity);
                }
            }
            $from = $order->status;
            $order->update([
                'status' => 'Cancelled',
                'fulfillment_status' => 'Cancelled',
            ]);
            OrderStatusEvent::create([
                'order_id' => $order->id,
                'from_status' => $from,
                'to_status' => 'Cancelled',
            ]);
        });
    }

    public function updateTelegram(Order $order, array $input): Order
    {
        if ($order->status === 'Completed') {
            $this->conflict(
                'Completed orders are immutable; create a refund or void correction instead',
            );
        }
        if ($order->source !== 'telegram') {
            throw new HttpResponseException(
                response()->json(
                    [
                        'message' =>
                            'Only Telegram order workflow can be updated here',
                    ],
                    400,
                ),
            );
        }

        $status = $input['status'] ?? $order->status;
        $total = array_key_exists('total', $input)
            ? Money::fromDecimal($input['total'], 'total')
            : $order->total_cents;

        DB::transaction(function () use ($order, $status, $total) {
            $order->refresh();
            if ($order->status === 'Completed') {
                $this->conflict('Completed orders are immutable');
            }

            if ($status === 'Completed') {
                $lines = $order
                    ->orderItems()
                    ->with('product')
                    ->lockForUpdate()
                    ->get()
                    ->map(fn($item) => [$item->product, $item->quantity])
                    ->all();
                foreach ($lines as [$product, $quantity]) {
                    if ($product->stock < $quantity) {
                        $this->stockConflict($product);
                    }
                    $product->decrement('stock', $quantity);
                }
                $this->recordNetProductRevenue(
                    $lines,
                    $order->subtotal_cents,
                    $total,
                );
            }

            $discount = max(0, $order->subtotal_cents - $total);
            $order->update([
                'status' => $status,
                'total_cents' => $total,
                'discount_type' => $discount ? 'fixed' : null,
                'discount_value' => $discount ?: null,
                'discount_amount_cents' => $discount,
                'payment' => in_array(
                    $status,
                    ['Paid', 'Ready', 'Completed'],
                    true,
                )
                    ? 'KHQR'
                    : $order->payment,
            ]);
        });

        return $order->fresh();
    }

    public function correct(
        Order $order,
        array $input,
        Employee $employee,
    ): Order {
        if ($order->status !== 'Completed') {
            $this->conflict('Only completed orders can be corrected');
        }
        $requested = isset($input['amount'])
            ? Money::fromDecimal($input['amount'], 'amount')
            : null;

        return DB::transaction(function () use (
            $order,
            $input,
            $employee,
            $requested,
        ) {
            $original = Order::whereKey($order->id)
                ->lockForUpdate()
                ->firstOrFail();
            $alreadyCorrected = (int) Order::where(
                'parent_order_id',
                $original->id,
            )
                ->selectRaw('coalesce(sum(-total_cents), 0) amount')
                ->value('amount');
            $available = $original->total_cents - $alreadyCorrected;
            $amount = $requested ?? $available;
            if ($amount < 1 || $amount > $available) {
                throw ValidationException::withMessages([
                    'amount' => ['Correction exceeds the unrefunded amount'],
                ]);
            }

            $status = $input['type'] === 'refund' ? 'Refunded' : 'Voided';
            return Order::create([
                'id' => 'RF-' . $this->nextOrderNumber('RF'),
                'cashier_id' => $employee->id,
                'customer_id' => $original->customer_id,
                'parent_order_id' => $original->id,
                'source' => $original->source,
                'time' => now()->format('g:i A'),
                'date' => 'Today',
                'items' => 0,
                'subtotal_cents' => 0,
                'discount_amount_cents' => 0,
                'total_cents' => -$amount,
                'payment' => $original->payment,
                'status' => $status,
                'detail_json' => ["$status correction for {$original->id}"],
            ]);
        });
    }

    private function lockRequestedProducts(
        array $requestedItems,
        bool $forHold = false,
    ): array {
        $lines = [];
        foreach ($requestedItems as $item) {
            $productId = (int) ($item['productId'] ?? $item['id']);
            $quantity = (int) $item['quantity'];
            $product = Product::whereKey($productId)
                ->where('active', true)
                ->lockForUpdate()
                ->firstOrFail();
            if (
                $product->stock - ($forHold ? $product->reserved_stock : 0) <
                $quantity
            ) {
                $this->stockConflict($product);
            }
            $lines[] = [$product, $quantity];
        }
        return $lines;
    }

    private function calculateDiscount(
        ?array $discount,
        int $subtotal,
        Employee $employee,
    ): array {
        if (
            !$discount ||
            empty($discount['type']) ||
            (string) ($discount['amount'] ?? '0') === '0'
        ) {
            return [null, null, 0];
        }

        $type = $discount['type'];
        $value =
            $type === 'percentage'
                ? Money::percentToBasisPoints($discount['amount'])
                : Money::fromDecimal($discount['amount'], 'discount.amount');
        $amount = Money::discountCents($subtotal, $type, $value);

        if ($employee->role !== 'admin') {
            $maxPercent =
                (string) (Setting::find('pos_rules')?->value_json[
                    'maxCashierDiscountPercent'
                ] ?? 10);
            $maxBasisPoints = Money::percentToBasisPoints($maxPercent);
            if (
                $subtotal > 0 &&
                $amount * 10_000 > $subtotal * $maxBasisPoints
            ) {
                throw new HttpResponseException(
                    response()->json(
                        [
                            'message' =>
                                'Discount exceeds the cashier limit and requires admin approval',
                            'maxCashierDiscountPercent' => (float) $maxPercent,
                        ],
                        403,
                    ),
                );
            }
        }

        return [$type, $value, $amount];
    }

    private function recordNetProductRevenue(
        array $lines,
        int $subtotal,
        int $total,
    ): void {
        $remaining = $total;
        $lastIndex = count($lines) - 1;
        foreach ($lines as $index => [$product, $quantity]) {
            $gross = $product->price_cents * $quantity;
            // Integer proportional allocation can leave a remainder; assigning it
            // to the final line keeps all product revenue equal to the order total.
            $net =
                $subtotal === 0
                    ? 0
                    : ($index === $lastIndex
                        ? $remaining
                        : intdiv($gross * $total, $subtotal));
            $remaining -= $net;
            $product->increment('sold', $quantity);
            $product->increment('revenue_cents', $net);
        }
    }

    private function nextOrderNumber(string $prefix = 'CS'): int
    {
        return Order::where('id', 'like', "$prefix-%")
            ->pluck('id')
            ->reduce(
                fn($max, $id) => max(
                    $max,
                    (int) substr($id, strlen($prefix) + 1),
                ),
                0,
            ) + 1;
    }

    private function existingIdempotentOrder(
        Order $order,
        Employee $employee,
    ): CreatedOrder {
        if ($order->cashier_id !== $employee->id) {
            throw new HttpResponseException(
                response()->json(
                    ['message' => 'Idempotency key is already in use'],
                    409,
                ),
            );
        }
        return new CreatedOrder($order, false);
    }

    private function stockConflict(Product $product): never
    {
        throw new HttpResponseException(
            response()->json(
                [
                    'message' => "{$product->name} does not have enough stock",
                ],
                409,
            ),
        );
    }

    private function conflict(string $message): never
    {
        throw new HttpResponseException(
            response()->json(['message' => $message], 409),
        );
    }
}
