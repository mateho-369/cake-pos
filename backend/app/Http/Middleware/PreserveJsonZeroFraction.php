<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * PHP's json_encode() silently drops the ".0" from any whole-number float
 * (json_encode(0.0) === "0"), so a money field lands in the response as an
 * integer whenever its value happens to be a whole dollar amount and as a
 * float otherwise. Every money field in this API is a decimal alias of a
 * ?float-returning Money::toDecimal() call — keep that type consistent for
 * API consumers no matter the value, instead of it flipping between int and
 * float depending on the amount.
 */
class PreserveJsonZeroFraction
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        if ($response instanceof JsonResponse) {
            $response->setEncodingOptions(
                $response->getEncodingOptions() | JSON_PRESERVE_ZERO_FRACTION,
            );
        }
        return $response;
    }
}
