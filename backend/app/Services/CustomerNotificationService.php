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
        $text = $this->messageFor($order);
        if ($text === null) {
            return false;
        }
        return $this->sendToCustomer($customer->telegram_user_id, $text);
    }

    /**
     * A quick manual note from staff to the customer who placed the order
     * (the pending-orders panel's "Message" action). Same shop bot, same
     * chat the customer is already talking to — no new integration.
     */
    public function sendNote(Order $order, string $text): bool
    {
        $order->loadMissing('customer');
        $customer = $order->customer;
        if (!$customer?->telegram_user_id) {
            return false;
        }
        return $this->sendToCustomer($customer->telegram_user_id, $text);
    }

    private function sendToCustomer(string $chatId, string $text): bool
    {
        $token = config('services.telegram.bot_token');
        if (!$token) {
            return false;
        }
        $base = rtrim((string) config('services.telegram.api_base'), '/');
        try {
            return Http::timeout(8)
                ->post("{$base}/bot{$token}/sendMessage", [
                    'chat_id' => $chatId,
                    'text' => $text,
                ])
                ->successful();
        } catch (\Throwable $exception) {
            report($exception);
            return false;
        }
    }

    /**
     * Every customer-facing line the bot sends is bilingual — Khmer first,
     * English second — exactly like the /start welcome. The two languages
     * live side by side in one message so the customer never has to switch
     * anything, and the English sentence is kept verbatim so nothing that
     * already reads it (tests, support scripts) changes meaning.
     */
    private function messageFor(Order $order): ?string
    {
        $codeKm = $order->pickup_code ? " (លេខកូដ {$order->pickup_code})" : '';
        $code = $order->pickup_code ? " (code {$order->pickup_code})" : '';
        $total = '$' . number_format($order->total_cents / 100, 2);
        $id = $order->id;
        return match ($order->status) {
            'Pending'
                => "🎂 បានទទួលការបញ្ជាទិញ {$id}{$codeKm} របស់អ្នក — សរុប {$total}។ យើងនឹងបញ្ជាក់ជូនក្នុងពេលឆាប់ៗ។\n" .
                "🎂 Your order {$id}{$code} was received — total {$total}. We'll confirm it shortly.",
            'Confirmed'
                => "✅ ការបញ្ជាទិញ {$id}{$codeKm} ត្រូវបានបញ្ជាក់ — សរុប {$total}។ ជួបគ្នាឆាប់ៗ!\n" .
                "✅ Your order {$id}{$code} is confirmed — total {$total}. See you soon!",
            // Accepted by the shop: the order is now parked in the held
            // queue, unpaid, waiting for the customer to collect it. Kept
            // clearly distinct from "confirmed" so the two never read alike.
            'Held'
                => "🧁 ហាងបានទទួលយកការបញ្ជាទិញ {$id}{$codeKm} របស់អ្នក — សរុប {$total}។ យើងកំពុងរក្សាទុកជូន សូមបង់ប្រាក់ពេលមកយក។\n" .
                "🧁 Your order {$id}{$code} has been accepted — total {$total}. We're holding it for you; pay when you collect it.",
            'Ready'
                => "🛎 ការបញ្ជាទិញ {$id}{$codeKm} រួចរាល់សម្រាប់មកយកហើយ — សរុប {$total}។\n" .
                "🛎 Your order {$id}{$code} is READY for pickup — total {$total}.",
            'Completed'
                => "🧾 ការបញ្ជាទិញ {$id}{$codeKm} បានបញ្ចប់។ បានបង់ {$total} ({$order->payment})។ សូមអរគុណ!\n" .
                "🧾 Your order {$id}{$code} is completed. Paid {$total} ({$order->payment}). Thank you!",
            'Cancelled'
                => "❌ ការបញ្ជាទិញ {$id}{$codeKm} ត្រូវបានបោះបង់។ បើចង់បញ្ជាទិញឡើងវិញ សូមផ្ញើសារមកយើង។\n" .
                "❌ Your order {$id}{$code} was cancelled. Message us if you'd like to reorder.",
            default => null,
        };
    }
}
