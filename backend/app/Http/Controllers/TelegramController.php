<?php
namespace App\Http\Controllers;

use App\Http\Resources\{OrderResource, ProductResource};
use App\Models\{Order, Product, Setting};
use App\Services\{CustomerOrderService, TelegramIdentityService};
use Illuminate\Http\{JsonResponse, Request};

class TelegramController extends Controller
{
    public function __construct(
        private readonly TelegramIdentityService $identity,
        private readonly CustomerOrderService $orders,
    ) {}

    public function products(Request $request): JsonResponse
    {
        $customer = $this->identity->customerFromInitData(
            $request->input('initData'),
        );
        $products = Product::with('category')
            ->with('images')
            ->where('active', true)
            ->where('stock', '>', 0)
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
        return response()->json(['ok' => true]);
    }

    private function khqrImageUrl(): string
    {
        return (string) (Setting::find('pos_rules')?->value_json[
            'khqrImageUrl'
        ] ?? config('services.telegram.khqr_image_url', ''));
    }
}
