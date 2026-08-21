<?php

return [
    'paths' => ['api/*', 'healthz'],
    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    'allowed_origins' => array_values(
        array_filter([
            env('ADMIN_ORIGIN'),
            env('SALE_ORIGIN'),
            env('SHOP_ORIGIN'),
        ]),
    ),
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['Accept', 'Authorization', 'Content-Type'],
    'exposed_headers' => [],
    'max_age' => 86400,
    'supports_credentials' => false,
];
