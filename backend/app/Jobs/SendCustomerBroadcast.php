<?php
namespace App\Jobs;
use App\Models\{Broadcast, Customer};
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Bus\Queueable;
use Illuminate\Support\Facades\Http;
class SendCustomerBroadcast implements ShouldQueue
{
    use Queueable;
    public function __construct(public int $broadcastId) {}
    public function handle(): void
    {
        $b = Broadcast::findOrFail($this->broadcastId);
        $token = config('services.telegram.bot_token');
        $url = config('services.telegram.shop_mini_app_url');
        $ok = 0;
        $failed = 0;
        Customer::whereNotNull('telegram_user_id')
            ->orderBy('id')
            ->chunkById(50, function ($customers) use (
                $b,
                $token,
                $url,
                &$ok,
                &$failed,
            ) {
                foreach ($customers as $c) {
                    try {
                        $sent = Http::timeout(8)
                            ->post(
                                "https://api.telegram.org/bot{$token}/sendMessage",
                                [
                                    'chat_id' => $c->telegram_user_id,
                                    'text' => $b->message,
                                    'reply_markup' => [
                                        'inline_keyboard' => [
                                            [
                                                [
                                                    'text' =>
                                                        '🛒 Open Shop / បើកហាង',
                                                    'web_app' => [
                                                        'url' => $url,
                                                    ],
                                                ],
                                            ],
                                        ],
                                    ],
                                ],
                            )
                            ->successful();
                        $sent ? $ok++ : $failed++;
                    } catch (\Throwable $e) {
                        $failed++;
                        report($e);
                    }
                    usleep(120000);
                }
            });
        $b->update([
            'success_count' => $ok,
            'failure_count' => $failed,
            'sent_at' => now(),
        ]);
    }
}
