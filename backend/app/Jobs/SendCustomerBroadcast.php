<?php
namespace App\Jobs;
use App\Models\{Broadcast, Customer};
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Bus\Queueable;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
class SendCustomerBroadcast implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;
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
                        $base = rtrim(
                            (string) config('services.telegram.api_base'),
                            '/',
                        );
                        $sent = Http::timeout(8)
                            ->post(
                                "{$base}/bot{$token}/" .
                                    ($b->image_url
                                        ? 'sendPhoto'
                                        : 'sendMessage'),
                                [
                                    'chat_id' => $c->telegram_user_id,
                                    $b->image_url ? 'photo' : 'text' =>
                                        $b->image_url ?:
                                        $b->caption ?? $b->message,
                                    ...$b->image_url
                                        ? [
                                            'caption' =>
                                                $b->caption ?? $b->message,
                                        ]
                                        : [],
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
