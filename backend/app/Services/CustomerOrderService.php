<?php
namespace App\Services;
use App\Jobs\SendCustomerStatusNotification;
use App\Models\{
    Customer,
    Employee,
    Order,
    OrderItem,
    OrderStatusEvent,
    Product,
    Shift,
};
use App\Support\Money;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Validation\ValidationException;
class CustomerOrderService
{
    public function __construct(private readonly AuditService $audit) {}

    /**
     * The customer's currently-open (held, unpaid) Telegram order, if any.
     * Used by the Mini App on reopen so the customer keeps adding to the
     * SAME order instead of stacking duplicates.
     */
    public function openOrderFor(Customer $customer): ?Order
    {
        return Order::where('customer_id', $customer->id)
            ->where('source', 'telegram')
            ->where('payment_status', '!=', 'paid')
            ->whereIn('status', ['Pending', 'Confirmed'])
            ->latest('created_at')
            ->first();
    }

    public function create(
        Customer $customer,
        array $requestedItems,
        mixed $requestedTotal,
        ?string $idempotencyKey = null,
    ): array {
        if (!Shift::where('status', 'Open')->exists()) {
            throw new HttpResponseException(
                response()->json(
                    [
                        'message' =>
                            'The shop is currently closed — no cashier is on shift',
                        'store_closed' => true,
                    ],
                    409,
                ),
            );
        }
        if (!$customer->phone) {
            abort(
                409,
                'Please share your phone in Telegram before sending the order',
            );
        }
        if (!$requestedItems) {
            throw ValidationException::withMessages([
                'items' => ['items are required'],
            ]);
        }
        // Double-tap guard: an idempotency key always returns the original.
        if (
            $idempotencyKey &&
            ($existing = Order::where(
                'idempotency_key',
                $idempotencyKey,
            )->first())
        ) {
            return [$existing, false];
        }
        [$order, $created] = DB::transaction(function () use (
            $customer,
            $requestedItems,
            $requestedTotal,
            $idempotencyKey,
        ) {
            // One open order per customer: if one exists, update it in place
            // — never create a second held order for the same session.
            $existing = Order::where('customer_id', $customer->id)
                ->where('source', 'telegram')
                ->where('payment_status', '!=', 'paid')
                ->whereIn('status', ['Pending', 'Confirmed'])
                ->lockForUpdate()
                ->latest('created_at')
                ->first();
            $lines = $this->lockAndValidateLines($requestedItems);
            $subtotal = collect($lines)->sum(
                fn($line) => $line[0]->price_cents * $line[1],
            );
            if (
                $subtotal !==
                Money::fromDecimal($requestedTotal, 'requestedTotal')
            ) {
                abort(409, 'Menu prices changed; please review your cart');
            }
            if ($existing) {
                $this->replaceLines($existing, $lines);
                $existing->update([
                    'items' => collect($lines)->sum(fn($l) => $l[1]),
                    'subtotal_cents' => $subtotal,
                    'total_cents' => $subtotal,
                    'time' => now()->format('g:i A'),
                    'detail_json' => collect($lines)
                        ->map(fn($l) => $l[0]->name . ' × ' . $l[1])
                        ->all(),
                    'updated_at' => now(),
                ]);
                return [$existing, false];
            }
            $order = Order::create([
                'id' => 'TG-' . $this->nextNumber(),
                'pickup_code' => $this->newPickupCode(),
                'customer_id' => $customer->id,
                'idempotency_key' => $idempotencyKey,
                'source' => 'telegram',
                'time' => now()->format('g:i A'),
                'date' => 'Today',
                'items' => collect($lines)->sum(fn($line) => $line[1]),
                'subtotal_cents' => $subtotal,
                'discount_amount_cents' => 0,
                'total_cents' => $subtotal,
                'status' => 'Pending',
                'payment_status' => 'unpaid',
                'fulfillment_status' => 'Held',
                'detail_json' => collect($lines)
                    ->map(fn($line) => $line[0]->name . ' × ' . $line[1])
                    ->all(),
            ]);
            foreach ($lines as [$product, $quantity]) {
                // Held-order mechanism: reserve the stock so nobody else can
                // sell it while the customer hasn't paid yet.
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
            $this->audit->log(null, 'customer_order.created', $order->id, [
                'customerId' => $customer->id,
                'customerName' => $customer->name,
                'phone' => $customer->phone,
                'pickupCode' => $order->pickup_code,
                'totalCents' => $subtotal,
            ]);
            return [$order, true];
        });
        if (!$created) {
            $this->audit->log(null, 'customer_order.updated', $order->id, [
                'customerId' => $customer->id,
                'totalCents' => $order->total_cents,
            ]);
        }
        return [$order, $created && $this->notifyAdmin($customer, $order)];
    }

    private function lockAndValidateLines(array $requestedItems): array
    {
        $lines = [];
        foreach ($requestedItems as $item) {
            $productId = (int) ($item['productId'] ?? ($item['id'] ?? 0));
            $quantity = (int) ($item['quantity'] ?? 0);
            if (!$productId || $quantity < 1) {
                throw ValidationException::withMessages([
                    'items' => [
                        'Each item needs a productId and a positive integer quantity',
                    ],
                ]);
            }
            $product = Product::whereKey($productId)
                ->where('active', true)
                ->lockForUpdate()
                ->firstOrFail();
            // A null price must never become a silent $0 customer order.
            if ($product->price_cents === null) {
                abort(
                    409,
                    "{$product->name} has no price and cannot be ordered",
                );
            }
            // Reserved units belong to other open orders — they are not
            // available for a new hold.
            if ($product->stock - $product->reserved_stock < $quantity) {
                abort(409, "{$product->name} does not have enough stock");
            }
            $lines[] = [$product, $quantity];
        }
        return $lines;
    }

    private function replaceLines(Order $order, array $lines): void
    {
        foreach ($order->orderItems()->lockForUpdate()->get() as $item) {
            if ($item->product_id) {
                Product::whereKey($item->product_id)
                    ->lockForUpdate()
                    ->first()
                    ?->decrement(
                        'reserved_stock',
                        min(
                            $item->quantity,
                            Product::whereKey($item->product_id)->value(
                                'reserved_stock',
                            ) ?? 0,
                        ),
                    );
            }
            $item->delete();
        }
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
    }

    /**
     * Customer-initiated cancellation from the phone Mini App.
     *
     * Only before the seller accepts: Pending/Confirmed/Ready. Once the
     * seller has accepted (status Held), staff owns the order and this
     * window is closed. Reserved stock is returned, the order is marked
     * Cancelled, and the customer is told through the shop bot.
     *
     * Staff can reject the same not-yet-accepted order from the terminal
     * (see rejectByStaff). Both paths take a row lock and re-read the
     * status inside the transaction, so whichever lands first wins and the
     * loser gets a plain 409 explaining what happened — never a crash or a
     * double release of the reserved stock.
     */
    public function cancel(Customer $customer, Order $order): void
    {
        DB::transaction(function () use ($customer, $order) {
            $order = Order::whereKey($order->id)
                ->lockForUpdate()
                ->firstOrFail();
            $cancellable =
                $order->customer_id === $customer->id &&
                $order->source === 'telegram' &&
                $order->payment_status !== 'paid' &&
                in_array(
                    $order->status,
                    ['Pending', 'Confirmed', 'Ready'],
                    true,
                );
            if (!$cancellable) {
                throw new HttpResponseException(
                    response()->json(
                        ['message' => $this->closedWindowMessage($order)],
                        409,
                    ),
                );
            }
            $from = $order->status;
            $this->releaseReservations($order);
            $order->update([
                'status' => 'Cancelled',
                'fulfillment_status' => 'Cancelled',
            ]);
            OrderStatusEvent::create([
                'order_id' => $order->id,
                'from_status' => $from,
                'to_status' => 'Cancelled',
                'metadata' => ['source' => 'customer'],
            ]);
            $this->audit->log(null, 'customer_order.cancelled', $order->id, [
                'customerId' => $customer->id,
                'fromStatus' => $from,
                'totalCents' => $order->total_cents,
                'source' => 'customer',
            ]);
        });
        SendCustomerStatusNotification::dispatch($order->id);
    }

    /**
     * Staff-initiated rejection of a pending, NOT-yet-accepted customer
     * order, from the sale terminal's pending queue.
     *
     * The counterpart of cancel(): after ringing the customer to confirm a
     * Telegram order, staff sometimes learn the customer never placed it.
     * They cannot always get that customer to self-cancel in the Mini App,
     * so they decline it here. Same effects as a self-cancel — reserved
     * stock released, order Cancelled, customer notified by the shop bot —
     * plus the acting employee and the optional reason in the audit trail.
     *
     * Only Pending/Confirmed/Ready unpaid Telegram orders: once the order
     * has been accepted it is a normal held order and goes through
     * OrderService::cancel instead.
     */
    public function rejectByStaff(
        Order $order,
        Employee $employee,
        ?string $reason = null,
    ): Order {
        $reason = $reason !== null ? (trim($reason) ?: null) : null;
        $rejected = DB::transaction(function () use (
            $order,
            $employee,
            $reason,
        ) {
            // Row lock + re-read: if the customer cancelled this order a
            // moment ago in the Mini App, we see the Cancelled status here
            // and stop with a 409 instead of releasing the stock twice.
            $order = Order::whereKey($order->id)
                ->lockForUpdate()
                ->firstOrFail();
            $rejectable =
                $order->source === 'telegram' &&
                $order->payment_status !== 'paid' &&
                in_array(
                    $order->status,
                    ['Pending', 'Confirmed', 'Ready'],
                    true,
                );
            if (!$rejectable) {
                throw new HttpResponseException(
                    response()->json(
                        ['message' => $this->staffRejectMessage($order)],
                        409,
                    ),
                );
            }
            $from = $order->status;
            $this->releaseReservations($order);
            $order->update([
                'status' => 'Cancelled',
                'fulfillment_status' => 'Cancelled',
            ]);
            OrderStatusEvent::create([
                'order_id' => $order->id,
                'from_status' => $from,
                'to_status' => 'Cancelled',
                'employee_id' => $employee->id,
                'metadata' => [
                    'source' => 'staff',
                    ...$reason ? ['reason' => $reason] : [],
                ],
            ]);
            $this->audit->log(
                $employee,
                'customer_order.rejected',
                $order->id,
                [
                    'customerId' => $order->customer_id,
                    'fromStatus' => $from,
                    'totalCents' => $order->total_cents,
                    'source' => 'staff',
                    ...$reason ? ['reason' => $reason] : [],
                ],
            );
            return $order;
        });
        SendCustomerStatusNotification::dispatch($rejected->id);
        return $rejected->refresh();
    }

    /**
     * Give the held units back to sellable stock. Never drives another
     * order's reservation negative: stock can be edited while an order
     * waits in the pending queue.
     */
    private function releaseReservations(Order $order): void
    {
        foreach ($order->orderItems()->lockForUpdate()->get() as $item) {
            if (!$item->product_id) {
                continue;
            }
            $product = Product::whereKey($item->product_id)
                ->lockForUpdate()
                ->first();
            if ($product && $product->reserved_stock > 0) {
                $product->decrement(
                    'reserved_stock',
                    min($product->reserved_stock, (int) $item->quantity),
                );
            }
        }
    }

    /** Why the customer's self-cancel window is closed, in plain words. */
    private function closedWindowMessage(Order $order): string
    {
        if ($order->status === 'Cancelled') {
            return 'This order has already been cancelled';
        }
        if ($order->payment_status === 'paid') {
            return 'This order has already been paid and can no longer be cancelled';
        }
        return 'This order can no longer be cancelled — it has already been accepted by the store';
    }

    /** Why staff cannot reject this order, in plain words. */
    private function staffRejectMessage(Order $order): string
    {
        if ($order->status === 'Cancelled') {
            return 'This order was already cancelled — the customer cancelled it first';
        }
        if ($order->payment_status === 'paid') {
            return 'This order has already been paid and can no longer be rejected';
        }
        if ($order->source !== 'telegram') {
            return 'Only customer (Telegram) orders can be rejected from the pending queue';
        }
        return 'This order was already accepted — cancel it from the held orders queue instead';
    }

    /** Short human-readable lookup code, unique among open orders. */
    private function newPickupCode(): string
    {
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        $open = Order::where('payment_status', '!=', 'paid')
            ->whereIn('status', ['Pending', 'Confirmed', 'Ready'])
            ->whereNotNull('pickup_code')
            ->pluck('pickup_code')
            ->all();
        do {
            $code = collect(range(1, 4))
                ->map(fn() => $alphabet[random_int(0, strlen($alphabet) - 1)])
                ->implode('');
        } while (in_array($code, $open, true));
        return $code;
    }

    private function notifyAdmin(Customer $customer, Order $order): bool
    {
        $token = config('services.telegram.staff_bot_token');
        $chat =
            \App\Models\Setting::find('pos_rules')?->value_json[
                'staffNotificationChatId'
            ] ?? config('services.telegram.staff_notification_chat_id');
        if (!$token || !$chat) {
            return false;
        }
        $lines = collect($order->detail_json)
            ->map(fn($line) => '• ' . $line)
            ->implode("\n");
        $text =
            "🔔 New customer order {$order->id} (code {$order->pickup_code})\n\n" .
            "Customer: {$customer->name}" .
            ($customer->telegram_username
                ? " (@{$customer->telegram_username})"
                : '') .
            "\nPhone: {$customer->phone}\n\n{$lines}\n\nTotal: $" .
            number_format(Money::toDecimal($order->total_cents), 2) .
            "\nStatus: HELD — unpaid until the customer arrives.";
        try {
            $base = rtrim((string) config('services.telegram.api_base'), '/');
            return Http::timeout(8)
                ->post("{$base}/bot{$token}/sendMessage", [
                    'chat_id' => $chat,
                    'text' => $text,
                ])
                ->successful();
        } catch (\Throwable $exception) {
            report($exception);
            return false;
        }
    }
    private function nextNumber(): int
    {
        return Order::pluck('id')->reduce(
            fn($max, $id) => max($max, (int) substr($id, 3)),
            0,
        ) + 1;
    }
}
