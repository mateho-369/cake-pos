<?php
namespace App\Http\Middleware;
use App\Models\Shift;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sale-creating endpoints (new orders, held orders, checkout) require an
 * open store shift. Browsing, login, reports, and customer/Telegram orders
 * deliberately do NOT go through this gate — a cashier may log in and look
 * around with no shift open; the sale app prompts to open one when a real
 * transaction is attempted.
 */
class RequireOpenShift
{
    public function handle(Request $request, Closure $next): Response
    {
        $hasOpenShift = Shift::where('status', 'Open')->exists();
        if (!$hasOpenShift) {
            return response()->json(
                [
                    'message' =>
                        'No open shift — open a shift before taking sales',
                    'requires_open_shift' => true,
                ],
                409,
            );
        }
        return $next($request);
    }
}
