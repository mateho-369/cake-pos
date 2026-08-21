<?php
use Illuminate\Support\Facades\Route;
Route::get(
    '/healthz',
    fn() => response()->json(['ok' => true, 'service' => 'cake-pos-api']),
);
