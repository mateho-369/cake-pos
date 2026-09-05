<?php

use App\Http\Middleware\EnsureActiveEmployee;
use App\Http\Middleware\RequireAdmin;
use App\Http\Middleware\RequireOpenShift;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

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
                422,
            );
        });
        // Local/CI diagnostics only: when a request arrives against the
        // localhost/127.0.0.1 origin (the CI API on :8080, or a dev server),
        // include the concrete exception so logs are diagnosable from the
        // response body/annotations. Remote production requests never see
        // internals — they keep the safe generic JSON error.
        $exceptions->render(function (Throwable $e, Request $request) {
            if (! in_array($request->getHost(), ['127.0.0.1', 'localhost'], true)) {
                return null;
            }
            // HttpResponseException (thrown by throttle: middleware and
            // friends) already carries the real, correctly-built response
            // (e.g. the 429 from RateLimiter::for('login', ...)'s own
            // ->response() callback) — it isn't an error to describe, it IS
            // the response. Laravel's default handler unwraps this via
            // getResponse(); this diagnostic override must do the same, or
            // every throttled/short-circuited request comes back as a
            // generic 500 for any request against localhost/127.0.0.1.
            if ($e instanceof \Illuminate\Http\Exceptions\HttpResponseException) {
                return $e->getResponse();
            }
            // Preserve the exception's real status (abort(409, ...) and
            // friends) instead of forcing 500 on everything — this
            // diagnostic handler was turning every intentional 4xx abort()
            // into a 500 for any request against localhost/127.0.0.1,
            // i.e. every CI/local run.
            $status = $e instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface
                ? $e->getStatusCode()
                : 500;
            return response()->json(
                [
                    'message' => $e->getMessage(),
                    'exception' => get_class($e),
                    'file' => $e->getFile(),
                    'line' => $e->getLine(),
                ],
                $status,
                [],
                JSON_PRETTY_PRINT,
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
