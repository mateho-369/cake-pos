<?php
namespace App\Services;
use App\Models\{Customer, Order, OrderItem, Product};
use App\Support\Money;
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Validation\ValidationException;
class CustomerOrderService
{
    public function create(
        Customer $customer,
        array $requestedItems,
        mixed $requestedTotal,
    ): array {
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
        $order = DB::transaction(function () use (
            $customer,
            $requestedItems,
            $requestedTotal,
        ) {
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
                if ($product->stock < $quantity) {
                    abort(409, "{$product->name} does not have enough stock");
                }
                $lines[] = [$product, $quantity];
            }
            $subtotal = collect($lines)->sum(
                fn($line) => $line[0]->price_cents * $line[1],
            );
            if (
                $subtotal !==
                Money::fromDecimal($requestedTotal, 'requestedTotal')
            ) {
                abort(409, 'Menu prices changed; please review your cart');
            }
            $order = Order::create([
                'id' => 'TG-' . $this->nextNumber(),
                'customer_id' => $customer->id,
                'source' => 'telegram',
                'time' => now()->format('g:i A'),
                'date' => 'Today',
                'items' => collect($lines)->sum(fn($line) => $line[1]),
                'subtotal_cents' => $subtotal,
                'discount_amount_cents' => 0,
                'total_cents' => $subtotal,
                'status' => 'Pending',
                'detail_json' => collect($lines)
                    ->map(fn($line) => $line[0]->name . ' × ' . $line[1])
                    ->all(),
            ]);
            foreach ($lines as [$product, $quantity]) {
                OrderItem::create([
                    'order_id' => $order->id,
                    'product_id' => $product->id,
                    'quantity' => $quantity,
                    'unit_price_cents' => $product->price_cents,
                ]);
            }
            return $order;
        });
        return [$order, $this->notifyAdmin($customer, $order)];
    }
    private function notifyAdmin(Customer $customer, Order $order): bool
    {
        $token = config('services.telegram.bot_token');
        $chat = config('services.telegram.admin_chat_id');
        if (!$token || !$chat) {
            return false;
        }
        $lines = collect($order->detail_json)
            ->map(fn($line) => '• ' . $line)
            ->implode("\n");
        $text =
            "🎂 New Telegram order {$order->id}\n\nCustomer: {$customer->name}" .
            ($customer->telegram_username
                ? " (@{$customer->telegram_username})"
                : '') .
            "\nPhone: {$customer->phone}\nTelegram ID: {$customer->telegram_user_id}\n\n{$lines}\n\nRequested total: $" .
            number_format(Money::toDecimal($order->total_cents), 2);
        try {
            return Http::timeout(8)
                ->post("https://api.telegram.org/bot{$token}/sendMessage", [
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
