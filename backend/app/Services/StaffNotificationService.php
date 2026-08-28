<?php
namespace App\Services;
use App\Models\{Order, Shift, Setting};
use Illuminate\Support\Facades\Http;
final class StaffNotificationService
{
    public function send(string $text): bool
    {
        $token = config('services.telegram.staff_bot_token');
        $chat =
            Setting::find('pos_rules')?->value_json[
                'staffNotificationChatId'
            ] ?? config('services.telegram.staff_notification_chat_id');
        if (!$token || !$chat) {
            return false;
        }
        $base = rtrim((string) config('services.telegram.api_base'), '/');
        try {
            return Http::timeout(8)
                ->post("{$base}/bot{$token}/sendMessage", [
                    'chat_id' => $chat,
                    'text' => $text,
                ])
                ->successful();
        } catch (\Throwable $e) {
            report($e);
            return false;
        }
    }
    public function orderCompleted(Order $order): void
    {
        $order->loadMissing(['cashier', 'payments']);
        $items = collect($order->detail_json)->implode("\n");
        $this->send(
            "✅ Order completed / បានបញ្ចប់ការបញ្ជាទិញ\n{$order->id}\n{$items}\nTotal / សរុប: $" .
                number_format($order->total_cents / 100, 2) .
                "\nPayment / ការទូទាត់: {$order->payment}\nCashier / អ្នកគិតលុយ: " .
                ($order->cashier?->name ?? '—'),
        );
    }
    public function shiftClosed(Shift $shift, array $sales): void
    {
        $shift->loadMissing('employee');
        $this->send(
            "🔒 Shift closed / បានបិទវេន\nCashier / អ្នកគិតលុយ: " .
                ($shift->employee?->name ?? '—') .
                "\nOpening USD: $" .
                number_format($shift->opening_cash_usd_cents / 100, 2) .
                ' | Opening KHR: ' .
                number_format($shift->opening_cash_khr) .
                "\nClosing USD: $" .
                number_format($shift->closing_cash_usd_cents / 100, 2) .
                ' | Closing KHR: ' .
                number_format($shift->closing_cash_khr) .
                "\nExpected USD/KHR: $" .
                number_format($shift->expected_cash_usd_cents / 100, 2) .
                ' / ' .
                number_format($shift->expected_cash_khr) .
                "\nVariance USD/KHR: $" .
                number_format($shift->variance_usd_cents / 100, 2) .
                ' / ' .
                number_format($shift->variance_khr) .
                "\nSales / ការលក់: $" .
                number_format(($sales[0] ?? 0) / 100, 2) .
                ' + ' .
                number_format($sales[1] ?? 0) .
                ' KHR',
        );
    }
}
