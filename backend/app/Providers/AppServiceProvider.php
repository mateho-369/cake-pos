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
            return Limit::perMinute(5)
                ->by($request->ip())
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
    }
}
