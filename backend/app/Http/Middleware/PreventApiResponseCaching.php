<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Every /api response is live application state: shifts, stock, orders,
 * reports. A shared cache in front of Laravel must never replay an old
 * "shift is open" snapshot (the production badge bug), so tell every client
 * and intermediate cache not to store it.
 */
class PreventApiResponseCaching
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $response->headers->set(
            'Cache-Control',
            'no-store, private, max-age=0',
        );
        $response->headers->set('Pragma', 'no-cache');

        return $response;
    }
}
