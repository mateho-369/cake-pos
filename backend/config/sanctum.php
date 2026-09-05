<?php
return [
    'stateful' => [],
    'guard' => ['web'],
    // Minutes a staff token stays valid; AuthController stamps expires_at
    // from this same value so one setting rules both ends.
    'expiration' => (int) env('SANCTUM_EXPIRATION', 720),
    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),
    'middleware' => [
        'authenticate_session' =>
            Laravel\Sanctum\Http\Middleware\AuthenticateSession::class,
        'encrypt_cookies' => Illuminate\Cookie\Middleware\EncryptCookies::class,
        'validate_csrf_token' =>
            Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
    ],
];
