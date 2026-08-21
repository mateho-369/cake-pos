<?php
namespace App\Services;
use App\Models\Customer;
class TelegramIdentityService
{
    public function customerFromInitData(?string $initData): Customer
    {
        $user = $this->verify($initData);
        $existing = Customer::where(
            'telegram_user_id',
            (string) $user['id'],
        )->exists();
        $name =
            trim(
                implode(
                    ' ',
                    array_filter([
                        $user['first_name'] ?? null,
                        $user['last_name'] ?? null,
                    ]),
                ),
            ) ?:
            'Telegram customer';
        return Customer::updateOrCreate(
            ['telegram_user_id' => (string) $user['id']],
            [
                'name' => $name,
                'telegram_username' => $user['username'] ?? null,
                'updated_at' => now(),
            ] + ($existing ? [] : ['first_seen_at' => now()]),
        );
    }
    public function verify(?string $initData): array
    {
        if (!$initData) {
            abort(401, 'Telegram initData is required');
        }
        $token = (string) config('services.telegram.bot_token');
        if (!$token) {
            abort(503, 'Telegram ordering is not configured');
        }
        parse_str($initData, $params);
        $hash = $params['hash'] ?? '';
        unset($params['hash']);
        ksort($params, SORT_STRING);
        $check = collect($params)
            ->map(fn($value, $key) => $key . '=' . $value)
            ->implode("\n");
        $secret = hash_hmac('sha256', $token, 'WebAppData', true);
        $expected = hash_hmac('sha256', $check, $secret);
        if (
            !preg_match('/^[a-f0-9]{64}$/i', $hash) ||
            !hash_equals($expected, $hash)
        ) {
            abort(401, 'Telegram initData signature is invalid');
        }
        if (
            !isset($params['auth_date']) ||
            abs(time() - (int) $params['auth_date']) > 86400
        ) {
            abort(401, 'Telegram initData has expired');
        }
        $user = json_decode($params['user'] ?? '', true);
        if (!$user || empty($user['id'])) {
            abort(401, 'Telegram user data is missing');
        }
        return $user;
    }
    public function customerFromBotUser(array $user): Customer
    {
        $existing = Customer::where(
            'telegram_user_id',
            (string) $user['id'],
        )->exists();
        $name =
            trim(
                implode(
                    ' ',
                    array_filter([
                        $user['first_name'] ?? null,
                        $user['last_name'] ?? null,
                    ]),
                ),
            ) ?:
            'Telegram customer';
        return Customer::updateOrCreate(
            ['telegram_user_id' => (string) $user['id']],
            [
                'name' => $name,
                'telegram_username' => $user['username'] ?? null,
                'updated_at' => now(),
            ] + ($existing ? [] : ['first_seen_at' => now()]),
        );
    }
}
