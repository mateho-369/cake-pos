<?php
use App\Http\Controllers\{
    AuthController,
    CategoryController,
    CustomerController,
    EmployeeController,
    OrderController,
    ProductController,
    ReceiptController,
    ReportController,
    SettingsController,
    ShiftController,
    TelegramController,
    UploadController,
};
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware(
    'throttle:login',
);
Route::post('/telegram/webhook', [TelegramController::class, 'webhook']);
Route::post('/customer-products', [TelegramController::class, 'products']);
Route::post('/customer-profile', [TelegramController::class, 'profile']);
Route::post('/customer-orders', [TelegramController::class, 'order']);
Route::post('/customer-orders/{order}/status', [
    TelegramController::class,
    'status',
]);

Route::middleware(['auth:sanctum', 'active'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::post('/uploads/presign', [UploadController::class, 'presign']);
    Route::post('/uploads/complete', [UploadController::class, 'complete']);
    Route::get('/products', [ProductController::class, 'index']);
    Route::post('/products', [ProductController::class, 'store']);
    Route::post('/products/import', [
        ProductController::class,
        'import',
    ])->middleware('admin');
    Route::put('/products/{product}', [
        ProductController::class,
        'update',
    ])->middleware('admin');
    Route::delete('/products/{product}', [
        ProductController::class,
        'destroy',
    ])->middleware('admin');
    Route::get('/categories', [CategoryController::class, 'index']);
    Route::post('/categories', [
        CategoryController::class,
        'store',
    ])->middleware('admin');
    Route::put('/categories/{category}', [
        CategoryController::class,
        'update',
    ])->middleware('admin');
    Route::delete('/categories/{category}', [
        CategoryController::class,
        'destroy',
    ])->middleware('admin');
    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store']);
    Route::post('/orders/hold', [OrderController::class, 'hold']);
    Route::get('/orders/held', [OrderController::class, 'held']);
    Route::post('/orders/{order}/pay', [OrderController::class, 'pay']);
    Route::post('/orders/{order}/cancel', [OrderController::class, 'cancel']);
    Route::patch('/orders/{order}', [
        OrderController::class,
        'update',
    ])->middleware('admin');
    Route::post('/orders/{order}/corrections', [
        OrderController::class,
        'correct',
    ])->middleware('admin');
    Route::get('/employees', [EmployeeController::class, 'index'])->middleware(
        'admin',
    );
    Route::post('/employees', [EmployeeController::class, 'store'])->middleware(
        'admin',
    );
    Route::put('/employees/{employee}', [
        EmployeeController::class,
        'update',
    ])->middleware('admin');
    Route::delete('/employees/{employee}', [
        EmployeeController::class,
        'destroy',
    ])->middleware('admin');
    Route::post('/shifts/open', [ShiftController::class, 'open']);
    Route::post('/shifts/close', [ShiftController::class, 'close']);
    Route::get('/shifts/current', [ShiftController::class, 'current']);
    Route::get('/shifts', [ShiftController::class, 'index']);
    Route::get('/reports/summary', [ReportController::class, 'report']);
    Route::get('/customers', [CustomerController::class, 'index'])->middleware(
        'admin',
    );
    Route::get('/customers/{customer}/orders', [
        CustomerController::class,
        'orders',
    ])->middleware('admin');
    Route::get('/settings/receipt-template', [
        SettingsController::class,
        'receiptTemplate',
    ]);
    Route::put('/settings/receipt-template', [
        SettingsController::class,
        'updateReceiptTemplate',
    ])->middleware('admin');
    Route::get('/settings/pos-rules', [SettingsController::class, 'posRules']);
    Route::put('/settings/pos-rules', [
        SettingsController::class,
        'updatePosRules',
    ])->middleware('admin');
    Route::get('/receipts/{order}', [ReceiptController::class, 'show']);
});
