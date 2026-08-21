<?php
namespace App\Http\Middleware;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
class EnsureActiveEmployee
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!$request->user()?->active) {
            return response()->json(
                ['message' => 'Token is invalid or the employee is inactive'],
                401,
            );
        }
        return $next($request);
    }
}
