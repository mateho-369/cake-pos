<?php

namespace App\Console\Commands;

use App\Services\ShopWelcomeService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * The shop bot's /start welcome fails closed at every link in the chain
 * (missing token, no webhook, secret mismatch, Telegram 400 on the
 * message). This is the tool that prints Telegram's own
 * `last_error_message` instead of guessing.
 *
 *   php artisan telegram:webhook
 *   php artisan telegram:webhook --set --url=https://api.example.com
 *   php artisan telegram:webhook --send=YOUR_CHAT_ID
 */
class TelegramWebhookCommand extends Command
{
    protected $signature = 'telegram:webhook
        {--set : Register the shop-bot webhook with Telegram}
        {--url= : API origin or full webhook URL (required with --set)}
        {--send= : Send the /start welcome to this Telegram chat id}';

    protected $description = 'Diagnose (or register) the shop bot webhook — the usual reason /start is silent.';

    public function handle(ShopWelcomeService $welcome): int
    {
        $failed = false;

        if ($this->option('set')) {
            $failed = !$this->registerWebhook() || $failed;
        }

        $failed = !$this->diagnose() || $failed;

        $chatId = $this->option('send');
        if (is_string($chatId) && $chatId !== '') {
            $failed = !$this->sendWelcome($welcome, $chatId) || $failed;
        }

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    private function diagnose(): bool
    {
        $token = (string) config('services.telegram.bot_token');
        $miniAppUrl = (string) config('services.telegram.shop_mini_app_url');
        $secret = (string) config('services.telegram.webhook_secret');

        $this->info('Shop bot (customer /start welcome)');
        $this->line('----------------------------------');
        $this->line(
            'SHOP_TELEGRAM_BOT_TOKEN     ' .
                ($token !== '' ? 'set' : 'MISSING'),
        );
        $this->line(
            'SHOP_MINI_APP_URL           ' .
                ($miniAppUrl !== '' ? $miniAppUrl : 'MISSING'),
        );
        $this->line(
            'TELEGRAM_WEBHOOK_SECRET     ' .
                ($secret !== '' ? 'set' : 'MISSING'),
        );

        $ok = true;
        if ($token === '') {
            $this->error(
                'Cannot talk to Telegram without SHOP_TELEGRAM_BOT_TOKEN.',
            );
            $ok = false;
        }
        if ($miniAppUrl === '') {
            $this->error(
                'The Open Shop button cannot be built without SHOP_MINI_APP_URL.',
            );
            $ok = false;
        } elseif (str_contains($miniAppUrl, 'yourdomain.com')) {
            $this->warn(
                'SHOP_MINI_APP_URL still looks like the .env.example placeholder.',
            );
            $ok = false;
        }
        if ($secret === '') {
            $this->error(
                'TELEGRAM_WEBHOOK_SECRET is unset: the webhook handler abort(401)s every update, so /start never runs. Set it, then --set the webhook with the same value.',
            );
            $ok = false;
        }

        if ($token === '') {
            return false;
        }

        $me = $this->telegram($token, 'getMe');
        if (!($me['ok'] ?? false)) {
            $this->error(
                'Telegram getMe failed: ' .
                    $this->describeTelegramError($me) .
                    ' — check SHOP_TELEGRAM_BOT_TOKEN.',
            );

            return false;
        }
        $username = $me['result']['username'] ?? '';
        $botId = $me['result']['id'] ?? '';
        $this->line(
            'Telegram getMe              ' .
                ($username !== '' ? '@' . $username : 'ok') .
                ($botId !== '' ? " (id {$botId})" : ''),
        );

        $info = $this->telegram($token, 'getWebhookInfo');
        if (!($info['ok'] ?? false)) {
            $this->error(
                'Telegram getWebhookInfo failed: ' .
                    $this->describeTelegramError($info),
            );

            return false;
        }
        $result = $info['result'] ?? [];
        $url = (string) ($result['url'] ?? '');
        $pending = (int) ($result['pending_update_count'] ?? 0);
        $lastError = (string) ($result['last_error_message'] ?? '');
        $lastErrorDate = (int) ($result['last_error_date'] ?? 0);

        $this->line(
            'Webhook URL                 ' .
                ($url !== '' ? $url : '(not registered)'),
        );
        $this->line('Pending updates             ' . $pending);
        if ($lastError !== '') {
            $when =
                $lastErrorDate > 0
                    ? ' @ ' . date('Y-m-d H:i:s T', $lastErrorDate)
                    : '';
            $this->error("Last error                  {$lastError}{$when}");
            $this->line('  ' . $this->interpretLastError($lastError));
            $ok = false;
        } else {
            $this->line('Last error                  (none)');
        }

        if ($url === '') {
            $this->error(
                'No webhook is registered. Telegram never delivers /start. Run: php artisan telegram:webhook --set --url=https://your-api',
            );
            $ok = false;
        }

        $this->line('');
        $this->line('Next:');
        $this->line(
            '  php artisan telegram:webhook --set --url=https://your-api',
        );
        $this->line(
            '  php artisan telegram:webhook --send=YOUR_TELEGRAM_CHAT_ID',
        );

        return $ok;
    }

    private function registerWebhook(): bool
    {
        $token = (string) config('services.telegram.bot_token');
        $secret = (string) config('services.telegram.webhook_secret');
        $url = $this->normalizeWebhookUrl((string) $this->option('url'));

        if ($token === '') {
            $this->error(
                'Cannot register a webhook without SHOP_TELEGRAM_BOT_TOKEN.',
            );

            return false;
        }
        if ($secret === '') {
            $this->error(
                'Refusing to register a webhook while TELEGRAM_WEBHOOK_SECRET is unset — the handler would 401 every update Telegram then delivered.',
            );

            return false;
        }
        if ($url === '') {
            $this->error(
                '--set requires --url (API origin or full https://…/api/telegram/webhook).',
            );

            return false;
        }

        $this->info("Registering webhook: {$url}");
        $response = $this->telegram($token, 'setWebhook', [
            'url' => $url,
            'secret_token' => $secret,
            'allowed_updates' => json_encode(['message']),
        ]);
        if (!($response['ok'] ?? false)) {
            $this->error(
                'setWebhook failed: ' . $this->describeTelegramError($response),
            );

            return false;
        }
        $this->info(
            (string) ($response['description'] ?? 'Webhook was set.'),
        );

        return true;
    }

    private function sendWelcome(ShopWelcomeService $welcome, string $chatId): bool
    {
        $this->info("Sending /start welcome to chat {$chatId}…");
        $error = $welcome->send($chatId);
        if ($error !== null) {
            $this->error("Send failed: {$error}");

            return false;
        }
        $this->info("Sent the /start welcome to chat {$chatId}.");

        return true;
    }

    /**
     * Accept either the API origin (https://api.example.com) or the full
     * webhook path. Never invent a URL from APP_URL — that is often
     * localhost and would register a webhook Telegram cannot reach.
     */
    private function normalizeWebhookUrl(string $url): string
    {
        $url = trim($url);
        if ($url === '') {
            return '';
        }
        $url = rtrim($url, '/');
        if (!str_ends_with($url, '/api/telegram/webhook')) {
            $url .= '/api/telegram/webhook';
        }

        return $url;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function telegram(string $token, string $method, array $payload = []): array
    {
        $base = rtrim((string) config('services.telegram.api_base'), '/');
        try {
            $response = Http::timeout(8)->post(
                "{$base}/bot{$token}/{$method}",
                $payload,
            );
        } catch (\Throwable $exception) {
            return [
                'ok' => false,
                'error_code' => 0,
                'description' => $exception->getMessage(),
            ];
        }

        $json = $response->json();
        if (is_array($json)) {
            if (!array_key_exists('ok', $json)) {
                $json['ok'] = $response->successful();
            }

            return $json;
        }

        return [
            'ok' => $response->successful(),
            'error_code' => $response->status(),
            'description' => $response->body(),
        ];
    }

    /**
     * @param  array<string, mixed>  $response
     */
    private function describeTelegramError(array $response): string
    {
        $code = $response['error_code'] ?? $response['status'] ?? '';
        $description = (string) ($response['description'] ?? '');
        if ($description === '') {
            $description = json_encode($response) ?: 'unknown error';
        }

        return trim($code . ' ' . $description);
    }

    private function interpretLastError(string $message): string
    {
        $lower = strtolower($message);
        if (
            str_contains($lower, '401') ||
            str_contains($lower, 'unauthorized')
        ) {
            return '401 Unauthorized = the secret_token given to setWebhook does not match TELEGRAM_WEBHOOK_SECRET (or the secret is unset and the handler rejects everything).';
        }
        if (
            str_contains($lower, 'connection refused') ||
            str_contains($lower, 'timed out') ||
            str_contains($lower, 'failed to connect')
        ) {
            return 'Connection refused / timeout = Telegram cannot reach the webhook URL. Check --url, HTTPS, and that the API is publicly reachable.';
        }
        if (str_contains($lower, '404') || str_contains($lower, 'not found')) {
            return '404 = the webhook URL path is wrong. It must end with /api/telegram/webhook.';
        }

        return 'Telegram names the real problem above; fix that, then --set the webhook again.';
    }
}
