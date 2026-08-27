<?php
namespace App\Http\Controllers;

use App\Http\Resources\{OrderResource, ProductResource};
use App\Models\{Order, Product, Setting};
use App\Services\{
    CustomerOrderService,
    ReportingService,
    TelegramIdentityService,
};
use App\Support\Money;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\Http;

class TelegramController extends Controller
{
    public function __construct(
        private readonly TelegramIdentityService $identity,
        private readonly CustomerOrderService $orders,
        private readonly ReportingService $reports,
    ) {}

    public function products(Request $request): JsonResponse
    {
        $customer = $this->identity->customerFromInitData(
            $request->input('initData'),
        );
        // Out-of-stock products stay visible (rendered with an "Out of
        // stock" label by the storefront) unless the admin opted that
        // specific product into hide-when-out-of-stock. Restocking above 0
        // makes it sellable again automatically — no re-toggle needed.
        $products = Product::with('category')
            ->with('images')
            ->where('active', true)
            ->where(
                fn($q) => $q
                    ->where('stock', '>', 0)
                    ->orWhere('hide_when_out_of_stock', false),
            )
            ->orderBy('category_id')
            ->orderBy('id')
            ->get();
        return response()->json([
            'customer' => [
                'name' => $customer->name,
                'username' => $customer->telegram_username,
                'phone' => $customer->phone,
            ],
            'products' => $products->map(
                fn($product) => ProductResource::make($product)->resolve(),
            ),
            'categories' => $products
                ->pluck('category.name')
                ->unique()
                ->values(),
            'khqrImageUrl' => $this->khqrImageUrl(),
        ]);
    }
    public function profile(Request $request): JsonResponse
    {
        $customer = $this->identity->customerFromInitData(
            $request->input('initData'),
        );
        return response()->json([
            'name' => $customer->name,
            'username' => $customer->telegram_username,
            'phone' => $customer->phone,
        ]);
    }
    public function order(Request $request): JsonResponse
    {
        $customer = $this->identity->customerFromInitData(
            $request->input('initData'),
        );
        [$order, $notified] = $this->orders->create(
            $customer,
            $request->input('items', []),
            $request->input('requestedTotal'),
            $request->input('idempotencyKey'),
        );
        return response()->json(
            [
                'order' => OrderResource::make($order)->resolve(),
                'notified' => $notified,
                'khqrImageUrl' => config(
                    'services.telegram.khqr_image_url',
                    '',
                ),
            ],
            201,
        );
    }

    /**
     * The customer's currently-held (unpaid) order, if any — lets the Mini
     * App reopen the same order and add items instead of creating a second.
     */
    public function openOrder(Request $request): JsonResponse
    {
        $customer = $this->identity->customerFromInitData(
            $request->input('initData'),
        );
        $order = $this->orders->openOrderFor($customer);
        if (!$order) {
            return response()->json(['order' => null, 'items' => []]);
        }
        // Include the cart lines so the Mini App can reopen the SAME order
        // and keep adding to it instead of starting over.
        $items = $order
            ->orderItems()
            ->get()
            ->map(
                fn($item) => [
                    'productId' => $item->product_id,
                    'name' => $item->description,
                    'quantity' => (int) $item->quantity,
                    'price' => Money::toDecimal((int) $item->unit_price_cents),
                ],
            )
            ->values();
        return response()->json([
            'order' => OrderResource::make($order)->resolve(),
            'items' => $items,
        ]);
    }

    public function status(Request $request, Order $order): JsonResponse
    {
        $customer = $this->identity->customerFromInitData(
            $request->input('initData'),
        );
        if (
            $order->customer_id !== $customer->id ||
            $order->source !== 'telegram'
        ) {
            abort(404, 'Order not found');
        }
        return response()->json(OrderResource::make($order)->resolve());
    }
    public function webhook(Request $request): JsonResponse
    {
        if (
            !config('services.telegram.webhook_secret') ||
            !hash_equals(
                (string) config('services.telegram.webhook_secret'),
                (string) $request->header('X-Telegram-Bot-Api-Secret-Token'),
            )
        ) {
            abort(401, 'Invalid Telegram webhook secret');
        }
        $message = $request->input('message');
        $contact = $message['contact'] ?? null;
        $from = $message['from'] ?? null;
        if (
            $contact &&
            $from &&
            !empty($contact['phone_number']) &&
            (!isset($contact['user_id']) ||
                (string) $contact['user_id'] === (string) $from['id'])
        ) {
            $customer = $this->identity->customerFromBotUser($from);
            $customer->update([
                'phone' => (string) $contact['phone_number'],
                'updated_at' => now(),
            ]);
        }
        $text = trim((string) ($message['text'] ?? ''));
        if ($from && str_starts_with($text, '/today')) {
            $this->sendTodaySummary((string) $from['id']);
        }
        return response()->json(['ok' => true]);
    }

    /**
     * /today on the staff bot (gcake_pos): the day's running summary, from
     * the exact same ReportingService the admin Reports page uses — one
     * source of truth, never a separate calculation.
     */
    private function sendTodaySummary(string $chatId): void
    {
        $token = config('services.telegram.staff_bot_token');
        if (!$token) {
            return;
        }
        $s = $this->reports->summary(['preset' => 'today']);
        $money = fn(int $cents) => '$' . number_format($cents / 100, 2);
        $text =
            '📊 Today — ' .
            now('Asia/Phnom_Penh')->format('M j') .
            "\nNet sales: " .
            $money($s['netRevenueCents']) .
            "\nCompleted orders: " .
            $s['completedOrderCount'] .
            "\nItems sold: " .
            $s['itemsSold'] .
            "\nCash: " .
            $money($s['cashRevenueCents']) .
            ' · KHQR: ' .
            $money($s['qrRevenueCents']) .
            " ({$s['qrPaymentCount']} payments)";
        try {
            Http::timeout(8)->post(
                "https://api.telegram.org/bot{$token}/sendMessage",
                ['chat_id' => $chatId, 'text' => $text],
            );
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    private function khqrImageUrl(): string
    {
        return (string) (Setting::find('pos_rules')?->value_json[
            'khqrImageUrl'
        ] ?? config('services.telegram.khqr_image_url', ''));
    }
}
