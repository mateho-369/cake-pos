<?php
namespace App\Services;
use App\Models\Order;
use Illuminate\Support\Facades\Http;

/**
 * Sends order-status updates to Telegram customers through the shop bot
 * (gcake_store). Numbers always come straight from the order row — the same
 * source as the printed and on-screen receipts.
 */
final class CustomerNotificationService
{
    public function notifyStatus(Order $order): bool
    {
        $order->loadMissing('customer');
        $customer = $order->customer;
        if (!$customer?->telegram_user_id) {
            return false;
        }
        $token = config('services.telegram.bot_token');
        if (!$token) {
            return false;
        }
        $text = $this->messageFor($order);
        if ($text === null) {
            return false;
        }
        try {
            return Http::timeout(8)
                ->post("https://api.telegram.org/bot{$token}/sendMessage", [
                    'chat_id' => $customer->telegram_user_id,
                    'text' => $text,
                ])
                ->successful();
        } catch (\Throwable $exception) {
            report($exception);
            return false;
        }
    }

    private function messageFor(Order $order): ?string
    {
        $code = $order->pickup_code ? " (code {$order->pickup_code})" : '';
        $total = '$' . number_format($order->total_cents / 100, 2);
        return match ($order->status) {
            'Pending'
                => "🎂 Your order {$order->id}{$code} was received — total {$total}. We'll confirm it shortly.",
            'Confirmed'
                => "✅ Your order {$order->id}{$code} is confirmed — total {$total}. See you soon!",
            'Ready'
                => "🛎 Your order {$order->id}{$code} is READY for pickup — total {$total}.",
            'Completed'
                => "🧾 Your order {$order->id}{$code} is completed. Paid {$total} ({$order->payment}). Thank you!",
            'Cancelled'
                => "❌ Your order {$order->id}{$code} was cancelled. Message us if you'd like to reorder.",
            default => null,
        };
    }
}
