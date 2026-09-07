<?php
namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use App\Support\BotSeparation;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}
    public function boot(): void
    {
        $sale = config('services.telegram.sale_bot_username');
        $shop = config('services.telegram.shop_bot_username');
        BotSeparation::assertDistinct($sale, $shop);
        RateLimiter::for('login', function (Request $request) {
            // Keyed by IP alone, one wrong PIN guess and one wrong password
            // guess for a DIFFERENT employee shared the same 5-per-minute
            // bucket — a small shop's staff sharing one router/WiFi could
            // lock each other out of legitimate logins. Email/password login
            // is scoped to (ip, email): still 5/min against any one account
            // from that IP, but a second cashier's login no longer burns the
            // first's budget. PIN login has no account identifier to scope
            // by, so it stays IP-only.
            $email = $request->input('email');
            $key = $email
                ? $request->ip() . '|' . strtolower($email)
                : $request->ip();
            return Limit::perMinute(5)
                ->by($key)
                ->response(function (Request $request, array $headers) {
                    $retry = (int) ($headers['Retry-After'] ?? 60);
                    return response()->json(
                        [
                            'message' => "Too many login attempts. Try again in {$retry} seconds.",
                            'retryAfter' => $retry,
                        ],
                        429,
                        $headers,
                    );
                });
        });
        // The Telegram Mini App's customer-facing routes (products, profile,
        // order placement/status/cancel, the bot webhook) carry no Sanctum
        // auth — initData HMAC-verifies the customer, but nothing capped how
        // many requests one source could send. Generous enough for normal
        // polling/browsing, but stops an unbounded flood from one IP from
        // tying up PHP workers/DB connections.
        RateLimiter::for('public', function (Request $request) {
            return Limit::perMinute(120)->by($request->ip());
        });
    }
}
