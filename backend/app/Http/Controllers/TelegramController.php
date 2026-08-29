<?php
namespace App\Http\Controllers;

use App\Http\Resources\{OrderResource, ProductResource};
use App\Models\{Order, Product, Setting, Shift};
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
            // Flat name list (back-compat) plus the hierarchy grouping so
            // the storefront can indent subcategories under their parent.
            'categories' => $products
                ->pluck('category.name')
                ->unique()
                ->values(),
            'categoryTree' => (function () use ($products) {
                $ids = $products->pluck('category_id')->unique()->filter();
                $direct = \App\Models\Category::whereIn('id', $ids)->get();
                $parentIds = $direct
                    ->pluck('parent_category_id')
                    ->filter()
                    ->unique();
                return \App\Models\Category::whereIn(
                    'id',
                    $ids->merge($parentIds)->unique(),
                )
                    ->where('active', true)
                    ->orderBy('sort_order')
                    ->orderBy('id')
                    ->get(['id', 'name', 'parent_category_id'])
                    ->map(fn($c) => [
                        'id' => $c->id,
                        'name' => $c->name,
                        'parentId' => $c->parent_category_id,
                    ])
                    ->values();
            })(),
            'khqrImageUrl' => $this->khqrImageUrl(),
            // Mirrors the admin sidebar Open badge and the sale terminal
            // shift gate: the shop is open iff a cashier has a shift open.
            'storeOpen' => Shift::where('status', 'Open')->exists(),
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
        // /start on the CUSTOMER bot (gcake_store): friendly bilingual
        // welcome + an inline keyboard whose primary button launches the
        // shop Mini App. Opening a bot chat always sends /start, so this
        // covers both "first messages the bot" and an explicit /start.
        if ($from && str_starts_with($text, '/start')) {
            $this->sendShopWelcome((string) $from['id']);
        }
        return response()->json(['ok' => true]);
    }

    /**
     * Welcome message for customers starting the shop bot. Wording is
     * bilingual (Khmer first line, English second) and intentionally lives
     * in one place so the shop owner can tweak the copy without hunting.
     */
    private function sendShopWelcome(string $chatId): void
    {
        $token = config('services.telegram.bot_token');
        $miniAppUrl = config('services.telegram.shop_mini_app_url');
        if (!$token || !$miniAppUrl) {
            return;
        }
        $profile = Setting::find('business_profile')?->value_json ?? [];
        // Copy is reviewed with the store owner; the business name itself
        // always comes from Settings → Business profile when set.
        $shopName =
            trim((string) ($profile['businessName'] ?? '')) ?: 'G-Cake';
        $text =
            "🎂 សូមស្វាគមន៍មកកាន់ {$shopName}!\n" .
            'យើងធ្វើនំថ្មីៗរាល់ថ្ងៃ ព្រមទាំងភេសជ្ជៈ និងសម្ភារៈពិធីជប់លៀង '
            . "\n" .
            'សូមមើលមឺនុយ ហើយកម្មង់មុនដើម្បីមកយកនៅហាង។' . "\n\n" .
            "🎂 Welcome to {$shopName}!\n" .
            "We bake fresh cakes every day — plus drinks and party supplies " .
            "for your celebration.\n" .
            'Browse the menu and order ahead for pickup.';

        // Primary: launch the Mini App. Secondary (only when the shop has a
        // phone or address on file): contact / location. Two buttons max.
        $keyboard = [
            [
                [
                    'type' => 'web_app',
                    'text' => '🛍️ Open Shop / បើកហាង',
                    'web_app' => ['url' => $miniAppUrl],
                ],
            ],
        ];
        $phone = trim((string) ($profile['phone'] ?? ''));
        $address = trim((string) ($profile['address'] ?? ''));
        if ($phone !== '' || $address !== '') {
            $keyboard[] = [
                [
                    'type' => 'url',
                    'text' => '📞 Contact / Location / ទំនាក់ទំនង',
                    'url' => $address !== ''
                        ? 'https://maps.google.com/?q=' . urlencode($address)
                        : 'tel:' . preg_replace('/[^0-9+]/', '', $phone),
                ],
            ];
        }
        try {
            $base = rtrim(
                (string) config('services.telegram.api_base'),
                '/',
            );
            Http::timeout(8)->post(
                "{$base}/bot{$token}/sendMessage",
                [
                    'chat_id' => $chatId,
                    'text' => $text,
                    'reply_markup' => json_encode([
                        'inline_keyboard' => $keyboard,
                    ]),
                ],
            );
        } catch (\Throwable $exception) {
            report($exception);
        }
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
            $base = rtrim(
                (string) config('services.telegram.api_base'),
                '/',
            );
            Http::timeout(8)->post(
                "{$base}/bot{$token}/sendMessage",
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
