<?php

use App\Http\Middleware\EnsureActiveEmployee;
use App\Http\Middleware\PreserveJsonZeroFraction;
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
        $middleware->api(append: [PreserveJsonZeroFraction::class]);
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
        // Error responses MUST still carry CORS headers. An exception unwinds
        // past HandleCors::addHeaders, so a 500 came back with no
        // Access-Control-Allow-Origin and the browser reported it as
        // "blocked by CORS policy" — hiding the real server error (this is
        // exactly what happened when object storage was unreachable).
        //
        // Local/CI diagnostics: for a genuine 500 against localhost/127.0.0.1
        // (the CI API on :8080, or a dev server), add the concrete exception
        // to the JSON body so CI logs/annotations are diagnosable. This used
        // to be a separate render() that tried to compute the status itself
        // — but Laravel's own rendering already correctly special-cases
        // ValidationException, AuthenticationException, HttpResponseException
        // (throttle:, and friends), HttpExceptionInterface, etc., and
        // hand-rolling those checks kept missing one (first
        // HttpResponseException, then AuthenticationException), silently
        // downgrading a correct 401/429/... back to a generic 500 for any
        // request against that host. Reading the FINAL status Laravel
        // already computed, after its own rendering, can't miss a case.
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
                if (
                    $response->getStatusCode() === 500 &&
                    in_array(
                        $request->getHost(),
                        ['127.0.0.1', 'localhost'],
                        true,
                    )
                ) {
                    $response = response()->json(
                        [
                            'message' => $e->getMessage(),
                            'exception' => get_class($e),
                            'file' => $e->getFile(),
                            'line' => $e->getLine(),
                        ],
                        500,
                        $response->headers->all(),
                        JSON_PRETTY_PRINT,
                    );
                }
                return $response;
            },
        );
    })
    ->create();
