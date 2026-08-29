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
    BroadcastController,
    BroadcastTemplateController,
    MediaController,
    SettingsController,
    ShiftController,
    TelegramController,
    UploadController,
    WasteController,
};
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware(
    'throttle:login',
);
Route::post('/telegram/webhook', [TelegramController::class, 'webhook']);
Route::post('/customer-products', [TelegramController::class, 'products']);
Route::post('/customer-profile', [TelegramController::class, 'profile']);
Route::post('/customer-orders', [TelegramController::class, 'order']);
Route::post('/customer-orders/open', [TelegramController::class, 'openOrder']);
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
    // Any authenticated employee: the counter cannot wait for an admin. A
    // cashier-created category is flagged pending_review (see controller).
    Route::post('/categories', [CategoryController::class, 'store']);
    Route::post('/categories/{category}/review', [
        CategoryController::class,
        'review',
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
    // Sale-creating endpoints require an open store shift. Deliberately NOT
    // gated: GET endpoints, cancel/message/corrections (bookkeeping and
    // customer communication, not sales), and the public customer/Telegram
    // order flow.
    Route::post('/orders', [OrderController::class, 'store'])->middleware(
        'open-shift',
    );
    Route::post('/orders/hold', [OrderController::class, 'hold'])->middleware(
        'open-shift',
    );
    Route::get('/orders/held', [OrderController::class, 'held']);
    Route::get('/orders/pending', [OrderController::class, 'pending']);
    Route::post('/orders/{order}/pay', [
        OrderController::class,
        'pay',
    ])->middleware('open-shift');
    Route::post('/orders/{order}/accept', [
        OrderController::class,
        'accept',
    ])->middleware('open-shift');
    Route::post('/orders/{order}/cancel', [OrderController::class, 'cancel']);
    // Quick manual note from staff to the order's customer over Telegram.
    Route::post('/orders/{order}/message', [OrderController::class, 'message']);
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
    Route::post('/broadcasts/poster', [
        BroadcastController::class,
        'poster',
    ])->middleware('admin');
    Route::get('/broadcast-templates', [
        BroadcastTemplateController::class,
        'index',
    ])->middleware('admin');
    Route::post('/broadcast-templates', [
        BroadcastTemplateController::class,
        'store',
    ])->middleware('admin');
    Route::put('/broadcast-templates/{broadcastTemplate}', [
        BroadcastTemplateController::class,
        'update',
    ])->middleware('admin');
    Route::delete('/broadcast-templates/{broadcastTemplate}', [
        BroadcastTemplateController::class,
        'destroy',
    ])->middleware('admin');
    Route::get('/storage/media', [MediaController::class, 'index'])->middleware(
        'admin',
    );
    Route::delete('/storage/media', [
        MediaController::class,
        'destroy',
    ])->middleware('admin');
    Route::get('/broadcasts/preview', [
        BroadcastController::class,
        'preview',
    ])->middleware('admin');
    Route::get('/broadcasts', [
        BroadcastController::class,
        'index',
    ])->middleware('admin');
    Route::post('/broadcasts', [
        BroadcastController::class,
        'store',
    ])->middleware('admin');
    Route::get('/reports/dashboard', [
        ReportController::class,
        'dashboard',
    ])->middleware('admin');
    Route::get('/reports/sales-summary', [
        ReportController::class,
        'summary',
    ])->middleware('admin');
    Route::get('/reports/revenue-trend', [
        ReportController::class,
        'trend',
    ])->middleware('admin');
    Route::get('/reports/products', [
        ReportController::class,
        'products',
    ])->middleware('admin');
    Route::get('/reports/categories', [
        ReportController::class,
        'categories',
    ])->middleware('admin');
    Route::get('/reports/payments', [
        ReportController::class,
        'payments',
    ])->middleware('admin');
    Route::get('/reports/cashiers', [
        ReportController::class,
        'cashiers',
    ])->middleware('admin');
    Route::get('/reports/peak-hours', [
        ReportController::class,
        'peakHours',
    ])->middleware('admin');
    Route::get('/reports/waste', [
        ReportController::class,
        'waste',
    ])->middleware('admin');
    Route::get('/reports/losses', [
        ReportController::class,
        'losses',
    ])->middleware('admin');
    Route::get('/reports/freshness', [
        ReportController::class,
        'freshness',
    ])->middleware('admin');
    Route::post('/inventory/waste', [
        WasteController::class,
        'store',
    ])->middleware('admin');
    Route::get('/reports/customers', [
        ReportController::class,
        'customers',
    ])->middleware('admin');
    Route::get('/reports/audit', [
        ReportController::class,
        'audit',
    ])->middleware('admin');
    Route::get('/reports/retention', [
        ReportController::class,
        'retention',
    ])->middleware('admin');
    Route::get('/reports/summary', [
        ReportController::class,
        'summary',
    ])->middleware('admin');
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
    Route::get('/settings/business-profile', [
        SettingsController::class,
        'businessProfile',
    ]);
    Route::put('/settings/business-profile', [
        SettingsController::class,
        'updateBusinessProfile',
    ])->middleware('admin');
    Route::get('/settings/pos-rules', [SettingsController::class, 'posRules']);
    Route::put('/settings/pos-rules', [
        SettingsController::class,
        'updatePosRules',
    ])->middleware('admin');
    Route::get('/receipts/{order}', [ReceiptController::class, 'show']);
});
