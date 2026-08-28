<?php

use App\Http\Middleware\EnsureActiveEmployee;
use App\Http\Middleware\PreventApiResponseCaching;
use App\Http\Middleware\RequireAdmin;
use App\Http\Middleware\RequireOpenShift;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'admin' => RequireAdmin::class,
            'active' => EnsureActiveEmployee::class,
            'open-shift' => RequireOpenShift::class,
        ]);
        $middleware->api(append: [PreventApiResponseCaching::class]);
        $middleware->redirectGuestsTo(fn() => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn() => true);
        $exceptions->render(function (ValidationException $e) {
            return response()->json(
                [
                    'message' =>
                        collect($e->errors())->flatten()->first() ??
                        'Validation failed',
                    'errors' => $e->errors(),
                ],
                400,
            );
        });
        // Error responses MUST still carry CORS headers. An exception unwinds
        // past HandleCors::addHeaders, so a 500 came back with no
        // Access-Control-Allow-Origin and the browser reported it as
        // "blocked by CORS policy" — hiding the real server error (this is
        // exactly what happened when object storage was unreachable).
        $exceptions->respond(
            function (Response $response, Throwable $e, Request $request) {
                $origin = $request->headers->get('Origin');
                $allowed = config('cors.allowed_origins', []);
                if ($origin && in_array($origin, $allowed, true)) {
                    $response->headers->set(
                        'Access-Control-Allow-Origin',
                        $origin,
                    );
                    $response->headers->set('Vary', 'Origin');
                }
                return $response;
            },
        );
    })
    ->create();
