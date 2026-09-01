<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * The /start welcome on the public shop bot (gcake_store): bilingual copy
 * plus an inline keyboard whose primary button launches the Mini App.
 *
 * Telegram rejects the *entire* sendMessage when any inline URL button is
 * not http(s)/tg — a `tel:` contact button is the classic silent failure
 * (HTTP 400 BUTTON_URL_INVALID, no welcome, no log). Phone numbers go in
 * the message text; only a business address becomes a maps button.
 */
final class ShopWelcomeService
{
    /**
     * Send the welcome to `$chatId`. Returns null on success, or a short
     * human-readable reason on skip/failure (the same reason is logged).
     */
    public function send(string $chatId): ?string
    {
        $token = config('services.telegram.bot_token');
        $miniAppUrl = config('services.telegram.shop_mini_app_url');
        if (!$token || !$miniAppUrl) {
            $reason =
                'SHOP_TELEGRAM_BOT_TOKEN or SHOP_MINI_APP_URL is not set';
            Log::warning('Shop /start welcome skipped: ' . $reason, [
                'has_token' => (bool) $token,
                'has_mini_app_url' => (bool) $miniAppUrl,
            ]);

            return $reason;
        }

        $payload = $this->payload($miniAppUrl);
        try {
            $base = rtrim((string) config('services.telegram.api_base'), '/');
            $response = Http::timeout(8)->post(
                "{$base}/bot{$token}/sendMessage",
                [
                    'chat_id' => $chatId,
                    'text' => $payload['text'],
                    'reply_markup' => json_encode([
                        'inline_keyboard' => $payload['keyboard'],
                    ]),
                ],
            );
            if (!$response->successful()) {
                $reason =
                    'Telegram HTTP ' .
                    $response->status() .
                    ': ' .
                    $response->body();
                Log::warning('Shop /start welcome was refused by Telegram', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                    'chat_id' => $chatId,
                ]);

                return $reason;
            }
        } catch (\Throwable $exception) {
            report($exception);

            return $exception->getMessage();
        }

        return null;
    }

    /**
     * @return array{text: string, keyboard: array<int, array<int, array<string, mixed>>>}
     */
    public function payload(string $miniAppUrl): array
    {
        $profile = Setting::find('business_profile')?->value_json ?? [];
        $shopName =
            trim((string) ($profile['businessName'] ?? '')) ?: 'G-Cake';
        $phone = trim((string) ($profile['phone'] ?? ''));
        $address = trim((string) ($profile['address'] ?? ''));

        // Copy is reviewed with the store owner; the business name itself
        // always comes from Settings → Business profile when set.
        $text =
            "🎂 សូមស្វាគមន៍មកកាន់ {$shopName}!\n" .
            'យើងធ្វើនំថ្មីៗរាល់ថ្ងៃ ព្រមទាំងភេសជ្ជៈ និងសម្ភារៈពិធីជប់លៀង ' .
            "\n" .
            'សូមមើលមឺនុយ ហើយកម្មង់មុនដើម្បីមកយកនៅហាង។' .
            "\n\n" .
            "🎂 Welcome to {$shopName}!\n" .
            'We bake fresh cakes every day — plus drinks and party supplies ' .
            "for your celebration.\n" .
            'Browse the menu and order ahead for pickup.';
        if ($phone !== '') {
            // Telegram inline URL buttons only accept http(s)/tg links. A
            // `tel:` button is rejected with 400 BUTTON_URL_INVALID, which
            // drops the whole welcome. Put the number in the body instead.
            $text .= "\n\n📞 {$phone}";
        }

        $keyboard = [
            [
                [
                    'type' => 'web_app',
                    'text' => '🛍️ Open Shop / បើកហាង',
                    'web_app' => ['url' => $miniAppUrl],
                ],
            ],
        ];
        if ($address !== '') {
            $keyboard[] = [
                [
                    'type' => 'url',
                    'text' => '📍 Location / ទីតាំង',
                    'url' =>
                        'https://maps.google.com/?q=' . urlencode($address),
                ],
            ];
        }

        return ['text' => $text, 'keyboard' => $keyboard];
    }
}
