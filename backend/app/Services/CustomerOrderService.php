<?php
namespace App\Services;
use App\Models\{Customer, Order, OrderItem, Product, Shift};
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
            $base = rtrim(
                (string) config('services.telegram.api_base'),
                '/',
            );
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
