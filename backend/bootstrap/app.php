<?php

use App\Http\Middleware\EnsureActiveEmployee;
use App\Http\Middleware\RequireAdmin;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Validation\ValidationException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias(['admin' => RequireAdmin::class, 'active' => \App\Http\Middleware\EnsureActiveEmployee::class]);
        $middleware->redirectGuestsTo(fn () => null);
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
    })
    ->create();
