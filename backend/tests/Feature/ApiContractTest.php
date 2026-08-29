<?php
namespace Tests\Feature;

use App\Models\{
    AuditEvent,
    Customer,
    Employee,
    Order,
    OrderStatusEvent,
    Product,
    ProductImage,
    Setting,
    Shift,
};
use App\Jobs\SendStaffCategoryProposedNotification;
use App\Services\ObjectUploadService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http, Queue, Storage};
use Illuminate\Support\Str;
use App\Support\BotSeparation;
use Tests\TestCase;

class ApiContractTest extends TestCase
{
    use RefreshDatabase;
    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }
    private function auth(Employee $employee): array
    {
        return [
            'Authorization' =>
                'Bearer ' .
                $employee->createToken('test', ['*'], now()->addHours(12))
                    ->plainTextToken,
        ];
    }
    /**
     * Sale-creating endpoints (POST /api/orders, /api/orders/hold,
     * /api/orders/{id}/pay) require an open shift. Tests that only care
     * about order semantics use this to satisfy the gate idempotently.
     */
    private function openShiftIfNone(Employee $employee): void
    {
        if (Shift::where('status', 'Open')->exists()) {
            return;
        }
        $this->postJson(
            '/api/shifts/open',
            ['openingCash' => '100.00'],
            $this->auth($employee),
        )->assertCreated();
    }
    private function signedInitData(array $user): string
    {
        $params = [
            'auth_date' => (string) time(),
            'query_id' => 'test-query',
            'user' => json_encode($user, JSON_UNESCAPED_SLASHES),
        ];
        ksort($params, SORT_STRING);
        $check = collect($params)
            ->map(fn($v, $k) => $k . '=' . $v)
            ->implode("\n");
        $secret = hash_hmac(
            'sha256',
            config('services.telegram.bot_token'),
            'WebAppData',
            true,
        );
        $params['hash'] = hash_hmac('sha256', $check, $secret);
        return http_build_query($params);
    }

    public function test_pin_login_is_limited_to_five_attempts_per_ip_per_minute(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.10'])
                ->postJson('/api/login', ['pin_code' => '0000'])
                ->assertUnauthorized();
        }
        $blocked = $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.10'])
            ->postJson('/api/login', ['pin_code' => '0000'])
            ->assertStatus(429)
            ->assertJsonStructure(['message', 'retryAfter']);
        $this->assertGreaterThan(
            0,
            (int) $blocked->headers->get('Retry-After'),
        );
        $this->assertStringContainsString(
            'Try again',
            $blocked->json('message'),
        );
    }
    public function test_email_and_pin_login_issue_tokens_with_twelve_hour_expiry(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.11'])
            ->postJson('/api/login', [
                'email' => env('SEED_ADMIN_EMAIL', 'owner@atelier.local'),
                'password' => env('SEED_ADMIN_PASSWORD', 'ChangeMe123!'),
            ])
            ->assertOk()
            ->assertJsonStructure([
                'token',
                'employee' => ['id', 'name', 'email', 'role'],
            ]);
        $pinLogin = $this->withServerVariables([
            'REMOTE_ADDR' => '203.0.113.12',
        ])
            ->postJson('/api/login', [
                'pin_code' => env('SEED_CASHIER_PIN', '1234'),
            ])
            ->assertOk()
            ->assertJsonPath('employee.role', 'cashier');
        $token = Employee::where('role', 'cashier')
            ->first()
            ->tokens()
            ->latest()
            ->first();
        $this->assertNotNull($token->expires_at);
        $this->assertEqualsWithDelta(
            720,
            now()->diffInMinutes($token->expires_at),
            1,
        );
        $token->update(['expires_at' => now()->subSecond()]);
        $this->getJson('/api/products', [
            'Authorization' => 'Bearer ' . $pinLogin->json('token'),
        ])->assertUnauthorized();
    }
    public function test_logout_deletes_the_current_sanctum_token(): void
    {
        $employee = Employee::where('role', 'cashier')->first();
        $plain = $employee->createToken(
            'logout-test',
            ['*'],
            now()->addHours(12),
        )->plainTextToken;
        $headers = ['Authorization' => 'Bearer ' . $plain];
        $this->postJson('/api/logout', [], $headers)->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->getJson('/api/products', $headers)->assertUnauthorized();
    }
    public function test_money_is_stored_and_calculated_only_as_integer_cents(): void
    {
        $admin = Employee::where('role', 'admin')->first();
        $this->openShiftIfNone($admin);
        $product = Product::first();
        $product->update(['price_cents' => 1001, 'stock' => 5]);
        $response = $this->postJson(
            '/api/orders',
            [
                'payment' => 'Cash',
                'items' => [['productId' => $product->id, 'quantity' => 3]],
                'discount' => ['type' => 'percentage', 'amount' => '5.00'],
                'idempotencyKey' => (string) Str::uuid(),
            ],
            $this->auth($admin),
        )->assertCreated();
        $response
            ->assertJsonPath('subtotal', 30.03)
            ->assertJsonPath('discountAmount', 1.5)
            ->assertJsonPath('total', 28.53);
        $order = Order::findOrFail($response->json('id'));
        $this->assertSame(3003, $order->subtotal_cents);
        $this->assertSame(150, $order->discount_amount_cents);
        $this->assertSame(2853, $order->total_cents);
        $this->assertStringContainsString(
            'bigint',
            DB::selectOne(
                "SHOW COLUMNS FROM products WHERE Field='price_cents'",
            )->Type,
        );
    }
    public function test_discount_rules_are_server_computed_capped_and_never_negative(): void
    {
        Setting::whereKey('pos_rules')->update([
            'value_json' => ['maxCashierDiscountPercent' => 10],
        ]);
        $cashier = Employee::where('role', 'cashier')->first();
        $admin = Employee::where('role', 'admin')->first();
        $this->openShiftIfNone($cashier);
        $p = Product::first();
        $p->update(['price_cents' => 1000, 'stock' => 10]);
        $this->postJson(
            '/api/orders',
            [
                'payment' => 'Cash',
                'items' => [['productId' => $p->id, 'quantity' => 1]],
                'discount' => ['type' => 'percentage', 'amount' => 11],
                'idempotencyKey' => (string) Str::uuid(),
            ],
            $this->auth($cashier),
        )
            ->assertForbidden()
            ->assertJsonPath('maxCashierDiscountPercent', 10);
        $fixed = $this->postJson(
            '/api/orders',
            [
                'payment' => 'Cash',
                'items' => [['productId' => $p->id, 'quantity' => 1]],
                'discount' => ['type' => 'fixed', 'amount' => 50],
                'idempotencyKey' => (string) Str::uuid(),
            ],
            $this->auth($admin),
        )->assertCreated();
        $fixed
            ->assertJsonPath('total', 0)
            ->assertJsonPath('discountAmount', 10)
            ->assertJsonPath('discountType', 'fixed');
        $this->assertSame(
            1000,
            Order::find($fixed->json('id'))->discount_amount_cents,
        );
    }
    public function test_idempotency_returns_original_order_and_decrements_stock_once(): void
    {
        $employee = Employee::where('role', 'cashier')->first();
        $this->openShiftIfNone($employee);
        $headers = $this->auth($employee);
        $p = Product::first();
        $before = $p->stock;
        $key = (string) Str::uuid();
        $payload = [
            'payment' => 'Cash',
            'items' => [['productId' => $p->id, 'quantity' => 1]],
            'idempotencyKey' => $key,
        ];
        $first = $this->postJson(
            '/api/orders',
            $payload,
            $headers,
        )->assertCreated();
        $second = $this->postJson(
            '/api/orders',
            $payload,
            $headers,
        )->assertOk();
        $this->assertSame($first->json('id'), $second->json('id'));
        $this->assertSame($before - 1, $p->fresh()->stock);
        $this->assertSame(1, Order::where('idempotency_key', $key)->count());
    }
    public function test_order_creation_uses_for_update_and_rolls_back_stock_failure(): void
    {
        $employee = Employee::where('role', 'cashier')->first();
        $this->openShiftIfNone($employee);
        $sql = [];
        DB::listen(function ($query) use (&$sql) {
            $sql[] = $query->sql;
        });
        $headers = $this->auth($employee);
        $p = Product::first();
        $other = Product::where('id', '!=', $p->id)->first();
        $before = $p->stock;
        $this->postJson(
            '/api/orders',
            [
                'payment' => 'Cash',
                'items' => [
                    ['productId' => $p->id, 'quantity' => 1],
                    [
                        'productId' => $other->id,
                        'quantity' => $other->stock + 1,
                    ],
                ],
                'idempotencyKey' => (string) Str::uuid(),
            ],
            $headers,
        )->assertStatus(409);
        $this->assertSame($before, $p->fresh()->stock);
        $this->assertSame(
            0,
            Order::where('cashier_id', $employee->id)->count(),
        );
        $this->assertTrue(
            collect($sql)->contains(
                fn($q) => str_contains(strtolower($q), 'for update'),
            ),
            'Expected a SELECT ... FOR UPDATE stock lock',
        );
    }
    public function test_completed_order_is_immutable_and_correction_is_linked(): void
    {
        $admin = Employee::where('role', 'admin')->first();
        $this->openShiftIfNone($admin);
        $headers = $this->auth($admin);
        $p = Product::first();
        $created = $this->postJson(
            '/api/orders',
            [
                'payment' => 'Cash',
                'items' => [['productId' => $p->id, 'quantity' => 1]],
                'idempotencyKey' => (string) Str::uuid(),
            ],
            $headers,
        )->assertCreated();
        $id = $created->json('id');
        $original = Order::findOrFail($id);
        $total = $original->total_cents;
        $this->patchJson(
            "/api/orders/$id",
            ['total' => 0, 'status' => 'Completed'],
            $headers,
        )->assertStatus(409);
        $this->assertSame($total, $original->fresh()->total_cents);
        $correction = $this->postJson(
            "/api/orders/$id/corrections",
            ['type' => 'refund', 'amount' => '1.00'],
            $headers,
        )->assertCreated();
        $correction
            ->assertJsonPath('originalOrderId', $id)
            ->assertJsonPath('status', 'Refunded')
            ->assertJsonPath('total', -1);
        $this->assertSame($total, $original->fresh()->total_cents);
    }
    public function test_shift_variance_uses_integer_cents(): void
    {
        $employee = Employee::where('role', 'cashier')->first();
        $headers = $this->auth($employee);
        $this->postJson(
            '/api/shifts/open',
            ['openingCash' => '100.00'],
            $headers,
        )->assertCreated();
        $p = Product::first();
        $this->postJson(
            '/api/orders',
            [
                'payment' => 'Cash',
                'items' => [['productId' => $p->id, 'quantity' => 1]],
                'idempotencyKey' => (string) Str::uuid(),
            ],
            $headers,
        )->assertCreated();
        $closed = $this->postJson(
            '/api/shifts/close',
            ['closingCash' => '130.00'],
            $headers,
        )->assertOk();
        $this->assertSame(
            10000 + $p->price_cents,
            DB::table('shifts')->value('expected_cash_cents'),
        );
        $this->assertEquals(
            30 - MoneyForTest::decimal($p->price_cents),
            $closed->json('variance'),
        );
    }
    public function test_sale_and_shop_bot_registrations_must_be_distinct(): void
    {
        BotSeparation::assertDistinct('private_staff_bot', 'public_shop_bot');
        $this->expectException(\RuntimeException::class);
        BotSeparation::assertDistinct('@same_bot', 'same_bot');
    }
    public function test_customer_endpoints_reject_missing_and_bad_init_data_and_accept_valid_signature(): void
    {
        config(['services.telegram.bot_token' => '123:test-token']);
        $this->postJson('/api/customer-products', [])->assertUnauthorized();
        $this->postJson('/api/customer-profile', [
            'initData' => 'auth_date=1&hash=bad',
        ])->assertUnauthorized();
        $valid = $this->signedInitData([
            'id' => 42,
            'first_name' => 'Srey',
            'username' => 'srey',
        ]);
        $this->postJson('/api/customer-products', ['initData' => $valid])
            ->assertOk()
            ->assertJsonPath('customer.name', 'Srey');
        $this->postJson('/api/customer-orders', [
            'initData' => 'bad',
            'items' => [],
        ])->assertUnauthorized();
    }
    public function test_presign_endpoint_requires_authentication_and_returns_upload_contract(): void
    {
        $this->postJson('/api/uploads/presign', [
            'fileName' => 'cake.png',
            'contentType' => 'image/png',
            'fileSize' => 68,
        ])->assertUnauthorized();

        $employee = Employee::first();
        $this->mock(ObjectUploadService::class, function ($mock) {
            $mock
                ->shouldReceive('presign')
                ->once()
                ->andReturn([
                    'uploadUrl' => 'https://media.test/signed-put',
                    'publicUrl' =>
                        'https://media.test/cake-pos/product-images/id.png',
                    'uploadKey' => 'product-images/id.png',
                    'headers' => ['Content-Type' => 'image/png'],
                ]);
        });
        $this->postJson(
            '/api/uploads/presign',
            [
                'fileName' => 'cake.png',
                'contentType' => 'image/png',
                'fileSize' => 68,
            ],
            $this->auth($employee),
        )
            ->assertOk()
            ->assertJsonStructure([
                'uploadUrl',
                'publicUrl',
                'uploadKey',
                'headers',
            ]);
    }

    public function test_verified_object_upload_is_persisted_and_visible_to_another_session(): void
    {
        Storage::fake('s3');
        config(['filesystems.disks.s3.url' => 'https://media.test/cake-pos']);
        $uploader = Employee::where('role', 'cashier')->first();
        $key = 'product-images/' . Str::uuid() . '.png';
        Cache::put(
            'upload:' . $uploader->id . ':' . hash('sha256', $key),
            [
                'contentType' => 'image/png',
                'fileName' => 'camera.png',
                'fileSize' => 68,
            ],
            now()->addMinutes(10),
        );
        Storage::disk('s3')->put(
            $key,
            base64_decode(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            ),
        );

        $completed = $this->postJson(
            '/api/uploads/complete',
            ['uploadKey' => $key],
            $this->auth($uploader),
        )
            ->assertOk()
            ->assertJsonPath('contentType', 'image/png');
        $publicUrl = $completed->json('publicUrl');

        $created = $this->postJson(
            '/api/products',
            [
                'name' => 'Uploaded Photo Cake',
                'category' => 'Signature',
                'price' => '10.00',
                'stock' => 1,
                'imageUrl' => $publicUrl,
            ],
            $this->auth($uploader),
        )->assertCreated();

        $otherSession = Employee::where('id', '!=', $uploader->id)->first();
        $products = $this->getJson(
            '/api/products',
            $this->auth($otherSession),
        )->assertOk();
        $this->assertSame(
            $publicUrl,
            collect($products->json())->firstWhere('id', $created->json('id'))[
                'imageUrl'
            ],
        );
    }

    public function test_upload_completion_rejects_bytes_that_do_not_match_declared_image_type(): void
    {
        Storage::fake('s3');
        $employee = Employee::first();
        $key = 'product-images/' . Str::uuid() . '.png';
        Cache::put(
            'upload:' . $employee->id . ':' . hash('sha256', $key),
            [
                'contentType' => 'image/png',
                'fileName' => 'fake.png',
                'fileSize' => 12,
            ],
            now()->addMinutes(10),
        );
        Storage::disk('s3')->put($key, 'not an image');

        $this->postJson(
            '/api/uploads/complete',
            ['uploadKey' => $key],
            $this->auth($employee),
        )->assertStatus(422);
        Storage::disk('s3')->assertMissing($key);
    }

    public function test_reports_summary_keeps_camel_case_contract(): void
    {
        $admin = Employee::where('role', 'admin')->first();
        $this->getJson('/api/reports/summary', $this->auth($admin))
            ->assertOk()
            ->assertJsonStructure([
                'todaySalesTotal',
                'todayOrdersCount',
                'revenueData',
                'topProducts',
                'yesterdaySalesTotal',
                'yesterdayOrdersCount',
                'itemsSold',
                'qrPaymentCount',
                'ordersData',
            ]);
    }

    private function createPaidOrder(
        Employee $cashier,
        Product $product,
        string $payment,
        int $quantity = 1,
        bool $confirmed = false,
    ): string {
        $payload = [
            'payment' => $payment,
            'items' => [['productId' => $product->id, 'quantity' => $quantity]],
            'idempotencyKey' => (string) Str::uuid(),
        ];
        if ($confirmed) {
            $payload['confirmed'] = true;
        }
        $this->openShiftIfNone($cashier);
        return $this->postJson('/api/orders', $payload, $this->auth($cashier))
            ->assertCreated()
            ->json('id');
    }

    public function test_walk_in_orders_are_counted_in_reports_summary(): void
    {
        $admin = Employee::where('role', 'admin')->first();
        $cashier = Employee::where('role', 'cashier')->first();
        $product = Product::first();
        $product->update(['price_cents' => 2000, 'stock' => 50]);
        // Cash order today: $20.00, 2 units.
        $this->createPaidOrder($cashier, $product, 'Cash', 2);
        // KHQR order today: $10.00, 1 unit, manually confirmed.
        $this->createPaidOrder($cashier, $product, 'KHQR', 1, true);
        // One more cash order yesterday so yesterdaySalesTotal is non-zero.
        $yesterdayId = $this->createPaidOrder($cashier, $product, 'Cash', 1);
        $yesterday = now()->subDay();
        DB::table('orders')
            ->where('id', $yesterdayId)
            ->update(['created_at' => $yesterday]);
        DB::table('order_payments')
            ->where('order_id', $yesterdayId)
            ->update(['confirmed_at' => $yesterday]);

        $summary = $this->getJson('/api/reports/summary', $this->auth($admin))
            ->assertOk()
            ->json();

        // Today: $20 + $10 = $30.00 net, 2 completed orders, 3 items sold,
        // 1 KHQR payment confirmed.
        $this->assertSame(30.0, $summary['todaySalesTotal']);
        $this->assertSame(2, $summary['todayOrdersCount']);
        $this->assertSame(3, $summary['itemsSold']);
        $this->assertSame(1, $summary['qrPaymentCount']);
        // Yesterday: one $20.00 order.
        $this->assertSame(20.0, $summary['yesterdaySalesTotal']);
        $this->assertSame(1, $summary['yesterdayOrdersCount']);
        // ordersData spans the last 7 days for the "today" preset so the
        // dashboard can compare today's pace against previous days. Days are
        // bucketed in the store timezone (Asia/Phnom_Penh).
        $today = now('Asia/Phnom_Penh')->format('Y-m-d');
        $this->assertCount(7, $summary['ordersData']);
        $this->assertSame(
            $today,
            $summary['ordersData'][count($summary['ordersData']) - 1]['day'],
        );
        $this->assertSame(
            2,
            collect($summary['ordersData'])->firstWhere('day', $today)['value'],
        );
    }

    public function test_freshness_report_computes_from_real_inventory_and_waste(): void
    {
        $admin = Employee::where('role', 'admin')->first();
        $employee = Employee::where('role', 'cashier')->first();
        Product::query()->delete();
        Product::create([
            'name' => 'Fresh Cake',
            'price_cents' => 1000,
            'stock' => 6,
            'made_at' => now()->toDateString(),
            'best_before' => now()->addDays(3)->toDateString(),
            'active' => true,
        ]);
        Product::create([
            'name' => 'Today Cake',
            'price_cents' => 1500,
            'stock' => 2,
            'made_at' => now()->toDateString(),
            'best_before' => now()->toDateString(),
            'active' => true,
        ]);
        Product::create([
            'name' => 'Tomorrow Cake',
            'price_cents' => 2000,
            'stock' => 3,
            'made_at' => now()->toDateString(),
            'best_before' => now()->addDay()->toDateString(),
            'active' => true,
        ]);
        DB::table('inventory_waste_events')->insert([
            'product_id' => null,
            'product_name_snapshot' => 'Today Cake',
            'quantity' => 1,
            'retail_value_cents' => 1500,
            'reason' => 'expired',
            'recorded_by_employee_id' => $employee->id,
            'recorded_at' => now(),
            'source' => 'admin',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $report = $this->getJson('/api/reports/freshness', $this->auth($admin))
            ->assertOk()
            ->json();

        // 6 fresh + 2 today + 3 tomorrow = 11 units total.
        $this->assertSame(11, $report['totalUnits']);
        $this->assertSame(6, $report['freshUnits']);
        $this->assertSame((int) round((6 / 11) * 100), $report['freshPercent']);
        $this->assertSame(2, $report['expiresTodayUnits']);
        $this->assertSame(3000, $report['expiresTodayValueCents']);
        $this->assertSame(3, $report['expiresTomorrowUnits']);
        $this->assertSame(6000, $report['expiresTomorrowValueCents']);
        // Waste recorded a minute ago shows up in this week's total.
        $this->assertSame(1500, $report['wasteThisWeekCents']);
        $this->assertCount(1, $report['events']);
        $this->assertSame('Today Cake', $report['events'][0]['productName']);
        $this->assertSame(1.5, $report['events'][0]['retailValue']);
    }

    public function test_record_waste_decrements_stock_and_appends_audit_event(): void
    {
        $admin = Employee::where('role', 'admin')->first();
        $product = Product::first();
        $product->update(['stock' => 3]);
        $response = $this->postJson(
            '/api/inventory/waste',
            [
                'productId' => $product->id,
                'quantity' => 2,
                'reason' => 'damaged',
                'note' => 'dropped during transport',
            ],
            $this->auth($admin),
        )->assertCreated();
        $response
            ->assertJsonPath('quantity', 2)
            ->assertJsonPath('reason', 'damaged')
            ->assertJsonPath('remainingStock', 1);
        $this->assertSame(1, $product->fresh()->stock);
        $this->assertDatabaseHas('inventory_waste_events', [
            'product_id' => $product->id,
            'quantity' => 2,
            'reason' => 'damaged',
            'note' => 'dropped during transport',
        ]);
        // Recording more than on hand must fail and keep stock unchanged.
        $this->postJson(
            '/api/inventory/waste',
            [
                'productId' => $product->id,
                'quantity' => 5,
                'reason' => 'expired',
            ],
            $this->auth($admin),
        )->assertStatus(422);
        $this->assertSame(1, $product->fresh()->stock);
    }

    public function test_reports_cashiers_qualifies_joined_columns(): void
    {
        // Regression: /api/reports/cashiers 500'd in production with
        // SQLSTATE[23000] 1052 "Column 'created_at' in where clause is
        // ambiguous" because the orders⋈employees join left created_at
        // unqualified. The query must run and attribute sales per cashier.
        $admin = Employee::where('role', 'admin')->first();
        $cashier = Employee::where('role', 'cashier')->first();
        $product = Product::first();
        $product->update(['price_cents' => 1500, 'stock' => 50]);
        $this->createPaidOrder($cashier, $product, 'Cash', 2);

        $rows = $this->getJson('/api/reports/cashiers', $this->auth($admin))
            ->assertOk()
            ->json();

        $row = collect($rows)->first(
            fn($r) => (int) ($r['cashier_id'] ?? 0) === (int) $cashier->id,
        );
        $this->assertNotNull($row, 'cashier row missing from report');
        $this->assertSame($cashier->name, $row['name']);
        $this->assertSame(1, (int) $row['completedOrderCount']);
        $this->assertSame(3000, (int) $row['netRevenueCents']);
    }

    public function test_login_does_not_open_a_shift(): void
    {
        // Logging in (email/password or PIN) must never auto-open a shift.
        $login = $this->postJson('/api/login', [
            'email' => env('SEED_CASHIER_EMAIL', 'sophea@atelier.local'),
            'password' => env('SEED_CASHIER_PASSWORD', 'ChangeMe123!'),
        ])->assertOk();
        $token = $login->json('token');
        $this->assertSame(
            'null',
            $this->getJson('/api/shifts/current', [
                'Authorization' => "Bearer $token",
            ])->getContent(),
        );
        $pin = $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.99'])
            ->postJson('/api/login', [
                'pin_code' => env('SEED_CASHIER_PIN', '1234'),
            ])
            ->assertOk();
        $this->assertSame(
            'null',
            $this->getJson('/api/shifts/current', [
                'Authorization' => 'Bearer ' . $pin->json('token'),
            ])->getContent(),
        );
    }

    public function test_shift_endpoints_are_never_shared_cacheable(): void
    {
        $admin = Employee::where('role', 'admin')->first();
        $headers = $this->auth($admin);

        // No open shift: the null answer is still live state.
        $this->getJson('/api/shifts/current', $headers)
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private, max-age=0');

        $this->postJson(
            '/api/shifts/open',
            ['openingCash' => '100.00'],
            $headers,
        )
            ->assertCreated()
            ->assertHeader('Cache-Control', 'no-store, private, max-age=0');

        $this->getJson('/api/shifts/current', $headers)
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private, max-age=0');

        $this->getJson('/api/shifts', $headers)
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private, max-age=0');
    }

    public function test_sale_endpoints_require_an_open_shift(): void
    {
        $cashier = Employee::where('role', 'cashier')->first();
        $headers = $this->auth($cashier);
        $p = Product::first();
        $p->update(['price_cents' => 1000, 'stock' => 10]);
        $items = ['items' => [['productId' => $p->id, 'quantity' => 1]]];

        // No shift open: every sale-creating endpoint is refused with the
        // structured "requires_open_shift" response the UI prompts on.
        $this->postJson(
            '/api/orders',
            $items + [
                'payment' => 'Cash',
                'idempotencyKey' => (string) Str::uuid(),
            ],
            $headers,
        )
            ->assertStatus(409)
            ->assertJsonPath('requires_open_shift', true);
        $this->postJson('/api/orders/hold', $items, $headers)
            ->assertStatus(409)
            ->assertJsonPath('requires_open_shift', true);

        // Open a shift through the normal flow: sales are allowed again.
        $this->postJson(
            '/api/shifts/open',
            ['openingCash' => '50.00'],
            $headers,
        )->assertCreated();
        $held = $this->postJson('/api/orders/hold', $items, $headers)
            ->assertCreated()
            ->json('id');
        $this->postJson(
            '/api/orders',
            $items + [
                'payment' => 'Cash',
                'idempotencyKey' => (string) Str::uuid(),
            ],
            $headers,
        )->assertCreated();

        // Close the shift: checkout is blocked too.
        $this->postJson(
            '/api/shifts/close',
            ['closingCash' => '60.00'],
            $headers,
        )->assertOk();
        $this->postJson(
            "/api/orders/$held/pay",
            [
                'method' => 'Cash',
                'usdReceivedCents' => 1000,
            ],
            $headers,
        )
            ->assertStatus(409)
            ->assertJsonPath('requires_open_shift', true);

        // Reopen: the same checkout goes through.
        $this->postJson(
            '/api/shifts/open',
            ['openingCash' => '50.00'],
            $headers,
        )->assertCreated();
        $this->postJson(
            "/api/orders/$held/pay",
            [
                'method' => 'Cash',
                'usdReceivedCents' => 1000,
            ],
            $headers,
        )->assertOk();
    }

    public function test_unreferenced_product_hard_deletes_assets_and_referenced_product_is_refused(): void
    {
        Storage::fake('s3');
        config(['filesystems.disks.s3.url' => 'https://cdn.test']);
        $admin = Employee::where('role', 'admin')->first();
        $cashier = Employee::where('role', 'cashier')->first();

        // Product A: never sold, has gallery rows + R2 objects.
        $a = Product::create([
            'name' => 'Mistake Cake',
            'category_id' => \App\Models\Category::first()->id,
            'price_cents' => 500,
            'stock' => 1,
            'made_at' => now()->toDateString(),
            'active' => true,
        ]);
        Storage::disk('s3')->put('product-images/aaa.jpg', 'x');
        Storage::disk('s3')->put('product-images/bbb.jpg', 'x');
        ProductImage::create([
            'product_id' => $a->id,
            'url' => 'https://cdn.test/product-images/aaa.jpg',
            'sort_order' => 0,
        ]);
        ProductImage::create([
            'product_id' => $a->id,
            'url' => 'https://cdn.test/product-images/bbb.jpg',
            'sort_order' => 1,
        ]);

        // Product B: has order history.
        $b = Product::first();
        $b->update(['price_cents' => 800, 'stock' => 10]);
        $this->createPaidOrder($cashier, $b, 'Cash', 1);

        // Referenced product: refused with the explanatory 422, kept intact.
        $this->deleteJson("/api/products/{$b->id}", [], $this->auth($admin))
            ->assertStatus(422)
            ->assertJsonPath('referenced_by_orders', true)
            ->assertJsonPath(
                'message',
                "Can't delete — referenced by past orders, deactivate instead",
            );
        $this->assertDatabaseHas('products', ['id' => $b->id]);

        // Unreferenced product: hard-deleted with images + R2 objects.
        $this->deleteJson("/api/products/{$a->id}", [], $this->auth($admin))
            ->assertOk()
            ->assertJsonPath('deleted', true);
        $this->assertDatabaseMissing('products', ['id' => $a->id]);
        $this->assertDatabaseMissing('product_images', [
            'product_id' => $a->id,
        ]);
        Storage::disk('s3')->assertMissing('product-images/aaa.jpg');
        Storage::disk('s3')->assertMissing('product-images/bbb.jpg');
    }

    public function test_customer_storefront_out_of_stock_rules(): void
    {
        config(['services.telegram.bot_token' => '123:test-token']);
        $initData = $this->signedInitData([
            'id' => 42,
            'first_name' => 'Srey',
            'username' => 'srey',
        ]);
        $category = \App\Models\Category::first();
        Product::query()->update(['active' => false]);
        $mk = fn(array $attrs) => Product::create(
            $attrs + ['made_at' => now()->toDateString()],
        );
        $shownOos = $mk([
            'name' => 'Shown OOS Cake',
            'category_id' => $category->id,
            'price_cents' => 1000,
            'stock' => 0,
            'active' => true,
            'hide_when_out_of_stock' => false,
        ]);
        $hiddenOos = $mk([
            'name' => 'Seasonal One-Off',
            'category_id' => $category->id,
            'price_cents' => 1200,
            'stock' => 0,
            'active' => true,
            'hide_when_out_of_stock' => true,
        ]);
        $inStock = $mk([
            'name' => 'In Stock Cake',
            'category_id' => $category->id,
            'price_cents' => 900,
            'stock' => 4,
            'active' => true,
            'hide_when_out_of_stock' => false,
        ]);

        $names = fn() => collect(
            $this->postJson('/api/customer-products', [
                'initData' => $initData,
            ])
                ->assertOk()
                ->json('products'),
        )->pluck('name');

        // Default: out-of-stock stays visible (flag is derived from stock on
        // the client); the hide-when-OOS override removes its product.
        $this->assertTrue($names()->contains('Shown OOS Cake'));
        $this->assertFalse($names()->contains('Seasonal One-Off'));
        $this->assertTrue($names()->contains('In Stock Cake'));

        // Restock above 0 -> sellable again with no re-toggle...
        $shownOos->update(['stock' => 3]);
        $this->assertTrue($names()->contains('Shown OOS Cake'));
        // ...and dropping back to 0 flips it back to shown-as-OOS only,
        // because the override flag is off.
        $shownOos->update(['stock' => 0]);
        $this->assertTrue($names()->contains('Shown OOS Cake'));
        $this->assertFalse($names()->contains('Seasonal One-Off'));

        // The manual `active` toggle stays independent and wins.
        $inStock->update(['active' => false]);
        $this->assertFalse($names()->contains('In Stock Cake'));
    }

    public function test_business_profile_settings_round_trip(): void
    {
        $admin = Employee::where('role', 'admin')->first();
        $this->putJson(
            '/api/settings/business-profile',
            [
                'businessName' => 'G-Cake Atelier',
                'locationName' => 'BKK1',
                'address' => 'Street 63, Phnom Penh',
                'phone' => '+855 23 000 000',
                'timezone' => 'Asia/Phnom_Penh',
                'primaryCurrency' => 'USD',
                'secondaryCurrency' => 'KHR',
            ],
            $this->auth($admin),
        )->assertOk();
        $this->getJson('/api/settings/business-profile', $this->auth($admin))
            ->assertOk()
            ->assertJsonPath('businessName', 'G-Cake Atelier');
        // Cashiers may read settings but not change them.
        $cashier = Employee::where('role', 'cashier')->first();
        $this->putJson(
            '/api/settings/business-profile',
            ['businessName' => 'Hijacked'],
            $this->auth($cashier),
        )->assertForbidden();
    }

    public function test_cashiers_report_includes_discount_void_and_variance_history(): void
    {
        $admin = Employee::where('role', 'admin')->first();
        $cashier = Employee::where('role', 'cashier')->first();
        $product = Product::first();
        $product->update(['price_cents' => 2000, 'stock' => 100]);

        // Shift 1: cashier discounts an order, then closes $2 short.
        $this->postJson(
            '/api/shifts/open',
            ['openingCash' => '100.00'],
            $this->auth($cashier),
        )->assertCreated();
        // 2 x $20 = $40 with a $3 discount (7.5%, inside the cashier limit).
        $orderId = $this->postJson(
            '/api/orders',
            [
                'payment' => 'Cash',
                'items' => [['productId' => $product->id, 'quantity' => 2]],
                'discount' => ['type' => 'fixed', 'amount' => '3.00'],
                'idempotencyKey' => (string) Str::uuid(),
            ],
            $this->auth($cashier),
        )
            ->assertCreated()
            ->json('id');
        // expected cash = 100 opening + 37 sale = 137; close at 135 -> -2.00
        $this->postJson(
            '/api/shifts/close',
            ['closingCash' => '135.00'],
            $this->auth($cashier),
        )->assertOk();
        // Admin voids $5 of that order (corrections are admin-only).
        $this->postJson(
            "/api/orders/$orderId/corrections",
            ['type' => 'void', 'amount' => '5.00'],
            $this->auth($admin),
        )->assertCreated();
        // Shift 2: cashier closes $1 short again -> a pattern.
        $this->postJson(
            '/api/shifts/open',
            ['openingCash' => '50.00'],
            $this->auth($cashier),
        )->assertCreated();
        $this->postJson(
            '/api/shifts/close',
            ['closingCash' => '49.00'],
            $this->auth($cashier),
        )->assertOk();

        $rows = $this->getJson(
            '/api/reports/cashiers?preset=today',
            $this->auth($admin),
        )
            ->assertOk()
            ->json();
        $row = collect($rows)->first(
            fn($r) => (int) ($r['cashier_id'] ?? 0) === (int) $cashier->id,
        );
        $this->assertNotNull($row, 'cashier row missing');
        $this->assertSame(1, $row['completedOrderCount']);
        $this->assertSame(3700, $row['netRevenueCents']);
        $this->assertSame(300, $row['discountsCents']);
        $this->assertSame(1, $row['discountCount']);
        $this->assertSame(2, $row['shiftsClosed']);
        $this->assertSame(2, $row['shortfallCount']);
        $this->assertTrue($row['repeatedShortfall']);
        $this->assertCount(2, $row['varianceHistory']);
        $this->assertSame(-200, $row['varianceHistory'][0]['varianceUsdCents']);

        $adminRow = collect($rows)->first(
            fn($r) => (int) ($r['cashier_id'] ?? 0) === (int) $admin->id,
        );
        $this->assertNotNull($adminRow, 'admin row missing');
        $this->assertSame(1, $adminRow['voidCount']);
        $this->assertSame(500, $adminRow['voidAmountCents']);
    }

    public function test_audit_log_records_discount_void_cancel_and_conversion(): void
    {
        config(['services.telegram.bot_token' => '123:test-token']);
        $admin = Employee::where('role', 'admin')->first();
        $cashier = Employee::where('role', 'cashier')->first();
        $product = Product::first();
        $product->update(['price_cents' => 1500, 'stock' => 50]);
        $this->openShiftIfNone($cashier);

        // Walk-in order with a discount.
        $walkInId = $this->postJson(
            '/api/orders',
            [
                'payment' => 'Cash',
                'items' => [['productId' => $product->id, 'quantity' => 1]],
                'discount' => ['type' => 'percentage', 'amount' => '10'],
                'idempotencyKey' => (string) Str::uuid(),
            ],
            $this->auth($cashier),
        )
            ->assertCreated()
            ->json('id');
        // Admin voids part of it.
        $this->postJson(
            "/api/orders/$walkInId/corrections",
            ['type' => 'void', 'amount' => '3.00'],
            $this->auth($admin),
        )->assertCreated();

        // Telegram customer order, then an admin price override, then cancel.
        $initData = $this->signedInitData([
            'id' => 42,
            'first_name' => 'Srey',
            'username' => 'srey',
        ]);
        $this->postJson('/api/customer-orders', [
            'initData' => $initData,
            'items' => [['productId' => $product->id, 'quantity' => 1]],
            'requestedTotal' => '15.00',
        ])->assertStatus(409); // no phone yet
        Customer::where('telegram_user_id', '42')->update([
            'phone' => '+855 12 345 678',
        ]);
        $tgId = $this->postJson('/api/customer-orders', [
            'initData' => $initData,
            'items' => [['productId' => $product->id, 'quantity' => 1]],
            'requestedTotal' => '15.00',
        ])
            ->assertCreated()
            ->json('order.id');
        $this->patchJson(
            "/api/orders/$tgId",
            ['total' => 12.0],
            $this->auth($admin),
        )->assertOk();
        $this->postJson(
            "/api/orders/$tgId/cancel",
            [],
            $this->auth($admin),
        )->assertOk();

        $events = $this->getJson(
            '/api/reports/audit?preset=today',
            $this->auth($admin),
        )
            ->assertOk()
            ->json();
        $actions = collect($events)->pluck('action', 'orderId');
        $discountEvent = collect($events)->first(
            fn($e) => $e['action'] === 'discount.applied' &&
                $e['orderId'] === $walkInId,
        );
        $this->assertNotNull($discountEvent, 'discount audit event missing');
        $this->assertSame($cashier->name, $discountEvent['employee']);
        $this->assertSame(
            150,
            $discountEvent['details']['discountAmountCents'],
        );
        $this->assertNotNull(
            collect($events)->first(
                fn($e) => $e['action'] === 'order.voided' &&
                    $e['orderId'] === $walkInId,
            ),
            'void audit event missing',
        );
        $override = collect($events)->first(
            fn($e) => $e['orderId'] === $tgId &&
                in_array(
                    $e['action'],
                    ['order.price_override', 'discount.applied'],
                    true,
                ),
        );
        $this->assertNotNull($override, 'price-override audit event missing');
        $this->assertSame(1500, $override['details']['beforeCents']);
        $this->assertSame(1200, $override['details']['afterCents']);
        $this->assertSame($admin->name, $override['employee']);
        $this->assertNotNull(
            collect($events)->first(
                fn($e) => $e['action'] === 'order.cancelled' &&
                    $e['orderId'] === $tgId,
            ),
            'cancel audit event missing',
        );
        $this->assertNotNull(
            collect($events)->first(
                fn($e) => $e['action'] === 'customer_order.created' &&
                    $e['orderId'] === $tgId,
            ),
            'customer_order.created audit event missing',
        );
        // Cashier cannot see the audit trail.
        $this->getJson(
            '/api/reports/audit?preset=today',
            $this->auth($cashier),
        )->assertForbidden();
    }

    public function test_customer_self_order_flow_hold_merge_convert(): void
    {
        config(['services.telegram.bot_token' => '123:test-token']);
        $admin = Employee::where('role', 'admin')->first();
        $cashier = Employee::where('role', 'cashier')->first();
        $this->openShiftIfNone($cashier);
        $product = Product::first();
        $product->update(['price_cents' => 1000, 'stock' => 10]);
        $initData = $this->signedInitData([
            'id' => 7,
            'first_name' => 'Bora',
            'username' => 'bora',
        ]);
        Customer::where('telegram_user_id', '7')->update([
            'phone' => '+855 99 887 766',
        ]);

        // Place order -> held, unpaid, reserved, with a pickup code.
        $first = $this->postJson('/api/customer-orders', [
            'initData' => $initData,
            'items' => [['productId' => $product->id, 'quantity' => 1]],
            'requestedTotal' => '10.00',
        ])->assertCreated();
        $orderId = $first->json('order.id');
        $code = $first->json('order.pickupCode');
        $this->assertNotEmpty($code);
        $this->assertLessThanOrEqual(8, strlen($code));
        $this->assertSame('Pending', $first->json('order.status'));
        $this->assertSame('unpaid', $first->json('order.paymentStatus'));
        $this->assertSame(1, $product->fresh()->reserved_stock);
        $this->assertSame(10, $product->fresh()->stock);

        // Reopen + add items: SAME order is updated, never a second one.
        $second = $this->postJson('/api/customer-orders', [
            'initData' => $initData,
            'items' => [['productId' => $product->id, 'quantity' => 2]],
            'requestedTotal' => '20.00',
        ])->assertCreated();
        $this->assertSame($orderId, $second->json('order.id'));
        $this->assertSame(
            2000,
            (int) round($second->json('order.total') * 100),
        );
        $this->assertSame(2, $product->fresh()->reserved_stock);
        $this->assertSame(
            1,
            Order::where(
                'customer_id',
                Customer::where('telegram_user_id', '7')->value('id'),
            )
                ->whereIn('status', ['Pending', 'Confirmed'])
                ->count(),
        );

        // Visible in the pending panel with pickup code, not stale yet.
        $pending = $this->getJson('/api/orders/pending', $this->auth($admin))
            ->assertOk()
            ->json();
        $entry = collect($pending)->firstWhere('id', $orderId);
        $this->assertNotNull($entry, 'pending panel missing the order');
        $this->assertSame($code, $entry['pickupCode']);
        $this->assertFalse($entry['isStale']);

        // Left overnight -> flagged stale.
        DB::table('orders')
            ->where('id', $orderId)
            ->update(['created_at' => now()->subDay()]);
        $pending2 = $this->getJson(
            '/api/orders/pending',
            $this->auth($admin),
        )->json();
        $this->assertTrue(
            collect($pending2)->firstWhere('id', $orderId)['isStale'],
        );

        // Close the shift that was required to place the Telegram order so
        // converting still proves the pay gate.
        $this->postJson(
            '/api/shifts/close',
            ['closingCash' => '100.00'],
            $this->auth($cashier),
        )->assertOk();
        // Converting to a paid sale requires an open shift...
        $this->postJson(
            "/api/orders/$orderId/pay",
            ['method' => 'Cash', 'usdReceivedCents' => 2000],
            $this->auth($cashier),
        )
            ->assertStatus(409)
            ->assertJsonPath('requires_open_shift', true);
        // ...and once open, completes and is attributed to the cashier.
        $this->postJson(
            '/api/shifts/open',
            ['openingCash' => '50.00'],
            $this->auth($cashier),
        )->assertCreated();
        $this->postJson(
            "/api/orders/$orderId/pay",
            ['method' => 'Cash', 'usdReceivedCents' => 2000],
            $this->auth($cashier),
        )->assertOk();
        $completed = Order::find($orderId);
        $this->assertSame('Completed', $completed->status);
        $this->assertSame('paid', $completed->payment_status);
        $this->assertSame($cashier->id, $completed->cashier_id);
        $this->assertSame(8, $product->fresh()->stock);
        $this->assertSame(0, $product->fresh()->reserved_stock);
        // The conversion is in the audit trail.
        $this->assertNotNull(
            AuditEvent::where('action', 'order.completed')
                ->where('order_id', $orderId)
                ->where('employee_id', $cashier->id)
                ->first(),
        );
    }

    /**
     * Rejecting a pending Telegram order (staff called to verify and the
     * customer says they never placed it): the order leaves the pending
     * queue, its reserved stock is given back, the rejection is
     * audit-logged with the acting employee and reason, and the customer
     * is told their order was cancelled. A rejected order cannot be
     * rejected or paid twice.
     */
    public function test_rejecting_a_pending_customer_order_releases_stock_and_notifies(): void
    {
        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
        config(['services.telegram.bot_token' => '123:test-token']);
        $cashier = Employee::where('role', 'cashier')->first();
        $this->openShiftIfNone($cashier);
        $product = Product::first();
        $product->update(['price_cents' => 1000, 'stock' => 10]);
        $initData = $this->signedInitData([
            'id' => 77,
            'first_name' => 'Chantrea',
            'username' => 'chantrea',
        ]);
        Customer::where('telegram_user_id', '77')->update([
            'phone' => '+855 92 111 222',
        ]);
        $orderId = $this->postJson('/api/customer-orders', [
            'initData' => $initData,
            'items' => [['productId' => $product->id, 'quantity' => 2]],
            'requestedTotal' => '20.00',
        ])
            ->assertCreated()
            ->json('order.id');
        $this->assertSame(2, (int) $product->fresh()->reserved_stock);

        // Reject it, with the reason staff typed into the confirm prompt.
        $this->postJson(
            "/api/orders/$orderId/cancel",
            ['reason' => 'Customer says they never placed it'],
            $this->auth($cashier),
        )->assertOk();

        $order = Order::find($orderId);
        $this->assertSame('Cancelled', $order->status);
        $this->assertSame('Cancelled', $order->fulfillment_status);
        $this->assertSame(10, (int) $product->fresh()->stock);
        $this->assertSame(0, (int) $product->fresh()->reserved_stock);
        // Gone from the pending panel.
        $this->assertNotContains(
            $orderId,
            collect(
                $this->getJson(
                    '/api/orders/pending',
                    $this->auth($cashier),
                )->json(),
            )->pluck('id'),
        );
        // Audit trail: who rejected it and why.
        $audit = AuditEvent::where('action', 'order.cancelled')
            ->where('order_id', $orderId)
            ->first();
        $this->assertNotNull($audit, 'reject audit event missing');
        $this->assertSame($cashier->id, $audit->employee_id);
        $this->assertSame(
            'Customer says they never placed it',
            $audit->details_json['reason'],
        );
        $this->assertSame(
            'Customer says they never placed it',
            OrderStatusEvent::where('order_id', $orderId)
                ->where('to_status', 'Cancelled')
                ->value('metadata->reason'),
        );
        // The customer was told (shop bot, sync queue -> inline send).
        Http::assertSent(function ($request) {
            return str_contains(
                $request->url(),
                'bot123:test-token/sendMessage',
            ) &&
                (string) $request['chat_id'] === '77' &&
                str_contains((string) $request['text'], 'was cancelled');
        });
        // A rejected order is final: no second reject, no paying it either.
        $this->postJson(
            "/api/orders/$orderId/cancel",
            [],
            $this->auth($cashier),
        )->assertStatus(409);
        $this->openShiftIfNone($cashier);
        $this->postJson(
            "/api/orders/$orderId/pay",
            ['method' => 'Cash', 'usdReceivedCents' => 2000],
            $this->auth($cashier),
        )->assertStatus(409);
        // And the customer can straight away place a new order.
        $this->postJson('/api/customer-orders', [
            'initData' => $initData,
            'items' => [['productId' => $product->id, 'quantity' => 1]],
            'requestedTotal' => '10.00',
        ])->assertCreated();
    }

    /**
     * The pending panel's "Message" action: staff send a quick manual note
     * to the order's customer through the same shop bot that delivers the
     * status notifications. Every send is audit-logged.
     */
    public function test_staff_can_message_a_customer_about_their_order_on_telegram(): void
    {
        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
        config(['services.telegram.bot_token' => '123:test-token']);
        $cashier = Employee::where('role', 'cashier')->first();
        $product = Product::first();
        $product->update(['price_cents' => 1200, 'stock' => 10]);
        $initData = $this->signedInitData([
            'id' => 88,
            'first_name' => 'Vibol',
            'username' => 'vibol',
        ]);
        Customer::where('telegram_user_id', '88')->update([
            'phone' => '+855 92 333 444',
        ]);
        $orderId = $this->postJson('/api/customer-orders', [
            'initData' => $initData,
            'items' => [['productId' => $product->id, 'quantity' => 1]],
            'requestedTotal' => '12.00',
        ])
            ->assertCreated()
            ->json('order.id');

        $this->postJson(
            "/api/orders/$orderId/message",
            ['text' => 'Your order is ready — see you at 4pm!'],
            $this->auth($cashier),
        )
            ->assertOk()
            ->assertJsonPath('delivered', true);

        Http::assertSent(function ($request) {
            return str_contains(
                $request->url(),
                'bot123:test-token/sendMessage',
            ) &&
                (string) $request['chat_id'] === '88' &&
                str_contains(
                    (string) $request['text'],
                    'Your order is ready — see you at 4pm!',
                );
        });
        // The note is in the audit trail with the acting employee.
        $audit = AuditEvent::where('action', 'customer_order.messaged')
            ->where('order_id', $orderId)
            ->first();
        $this->assertNotNull($audit, 'message audit event missing');
        $this->assertSame($cashier->id, $audit->employee_id);
        $this->assertSame(
            'Your order is ready — see you at 4pm!',
            $audit->details_json['text'],
        );
        $this->assertTrue((bool) $audit->details_json['delivered']);
        // The message does not touch the order itself.
        $this->assertSame('Pending', Order::find($orderId)->status);

        // A walk-in order has no customer to reach -> clean conflict.
        $walkInId = $this->createPaidOrder($cashier, $product, 'Cash', 1);
        $this->postJson(
            "/api/orders/$walkInId/message",
            ['text' => 'hello?'],
            $this->auth($cashier),
        )->assertStatus(409);
        // Empty notes are rejected.
        $this->postJson(
            "/api/orders/$orderId/message",
            ['text' => '   '],
            $this->auth($cashier),
        )->assertUnprocessable();
    }

    public function test_sales_endpoints_cannot_create_anonymous_sales(): void
    {
        $product = Product::first();
        $product->update(['stock' => 10]);
        // No token at all -> 401, no order created.
        $this->postJson('/api/orders', [
            'payment' => 'Cash',
            'items' => [['productId' => $product->id, 'quantity' => 1]],
        ])->assertUnauthorized();
        $this->assertSame(0, Order::count());
    }

    public function test_staff_webhook_today_command_reuses_reports_source(): void
    {
        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
        config([
            'services.telegram.staff_bot_token' => '123:staff-token',
            'services.telegram.webhook_secret' => 'sekret',
        ]);
        $admin = Employee::where('role', 'admin')->first();
        $cashier = Employee::where('role', 'cashier')->first();
        $product = Product::first();
        $product->update(['price_cents' => 2000, 'stock' => 50]);
        $this->createPaidOrder($cashier, $product, 'Cash', 2);

        $this->postJson(
            '/api/telegram/webhook',
            ['message' => ['text' => '/today', 'from' => ['id' => 99]]],
            ['X-Telegram-Bot-Api-Secret-Token' => 'sekret'],
        )->assertOk();

        Http::assertSent(function ($request) {
            return str_contains(
                $request->url(),
                'bot123:staff-token/sendMessage',
            ) &&
                str_contains((string) $request['text'], 'Net sales: $40.00') &&
                str_contains((string) $request['text'], 'Completed orders: 1');
        });
        // Wrong secret is rejected.
        $this->postJson(
            '/api/telegram/webhook',
            ['message' => ['text' => '/today', 'from' => ['id' => 99]]],
            ['X-Telegram-Bot-Api-Secret-Token' => 'wrong'],
        )->assertUnauthorized();
    }

    /**
     * Regression for the reported "unknown category: Signature" rejection:
     * product creation must validate against the real categories table the
     * admin manages — by id primarily, by name only for legacy callers.
     */
    public function test_product_category_validates_against_real_categories_not_a_fixed_list(): void
    {
        $admin = Employee::where('role', 'admin')->first();
        $headers = $this->auth($admin);

        // The admin creates a brand-new category through the real endpoint.
        $created = $this->postJson(
            '/api/categories',
            ['name' => 'Latte Art', 'color' => '#059669', 'active' => true],
            $headers,
        )->assertCreated()->json();
        $this->assertDatabaseHas('categories', ['name' => 'Latte Art']);

        // A product in that new category is accepted immediately (by id).
        $product = $this->postJson(
            '/api/products',
            [
                'name' => 'Iced Latte',
                'categoryId' => $created['id'],
                'price' => 2.5,
                'stock' => 10,
            ],
            $headers,
        )
            ->assertCreated()
            ->json();
        $this->assertSame('Latte Art', $product['category']);
        $this->assertDatabaseHas('products', [
            'id' => $product['id'],
            'category_id' => $created['id'],
        ]);

        // Legacy name-based callers (sale quick-add, CSV import) still work.
        $byName = $this->postJson(
            '/api/products',
            [
                'name' => 'Flat White',
                'category' => 'Latte Art',
                'price' => 3,
                'stock' => 5,
            ],
            $headers,
        )->assertCreated()->json();
        $this->assertSame($created['id'], DB::table('products')->where('id', $byName['id'])->value('category_id'));

        // Renaming the category never orphans the product (id stays stable).
        $this->putJson(
            "/api/categories/{$created['id']}",
            ['name' => 'Latte Art ២'],
            $headers,
        )->assertOk();
        $this->assertSame(
            $created['id'],
            DB::table('products')->where('id', $product['id'])->value('category_id'),
        );

        // Unknown ids and names are both still rejected.
        $this->postJson(
            '/api/products',
            ['name' => 'X', 'categoryId' => 999999, 'price' => 1, 'stock' => 1],
            $headers,
        )->assertUnprocessable()->assertJsonValidationErrors('category');
        $this->postJson(
            '/api/products',
            ['name' => 'X', 'category' => 'Nope', 'price' => 1, 'stock' => 1],
            $headers,
        )->assertUnprocessable()->assertJsonValidationErrors('category');
    }

    public function test_category_hierarchy_supports_one_level_of_subcategories(): void
    {
        $admin = Employee::where('role', 'admin')->first();
        $headers = $this->auth($admin);

        $parent = $this->postJson(
            '/api/categories',
            ['name' => 'Drinks ជប់លៀង', 'active' => true],
            $headers,
        )->assertCreated()->json();
        $child = $this->postJson(
            '/api/categories',
            [
                'name' => 'Coffee',
                'active' => true,
                'parentCategoryId' => $parent['id'],
            ],
            $headers,
        )->assertCreated()->json();
        $this->assertSame($parent['id'], $child['parentId']);

        // The index exposes the grouping for pickers.
        $list = $this->getJson('/api/categories', $headers)
            ->assertOk()
            ->json();
        $childRow = collect($list)->first(fn($c) => $c['id'] === $child['id']);
        $this->assertSame($parent['id'], $childRow['parentId']);
        $this->assertSame('Drinks ជប់លៀង', $childRow['parentName']);
        $parentRow = collect($list)->first(fn($c) => $c['id'] === $parent['id']);
        $this->assertNull($parentRow['parentId']);

        // Existing flat categories are unaffected (parent stays null).
        $flat = $this->postJson(
            '/api/categories',
            ['name' => 'Seasonal / Holiday', 'active' => true],
            $headers,
        )->assertCreated()->json();
        $this->assertNull($flat['parentId']);

        // One level only: a subcategory cannot have children…
        $this->postJson(
            '/api/categories',
            [
                'name' => 'Espresso',
                'active' => true,
                'parentCategoryId' => $child['id'],
            ],
            $headers,
        )->assertUnprocessable();
        // …and a category cannot become its own parent.
        $this->putJson(
            "/api/categories/{$parent['id']}",
            ['parentCategoryId' => $parent['id']],
            $headers,
        )->assertUnprocessable();

        // A parent can be cleared again (back to top-level).
        $this->putJson(
            "/api/categories/{$child['id']}",
            ['parentCategoryId' => null],
            $headers,
        )->assertOk();
        $this->assertNull(
            DB::table('categories')->where('id', $child['id'])->value('parent_category_id'),
        );
    }

    /**
     * "Boss says add a Seasonal category": the cashier creates it at the
     * counter and it is usable in the same breath — never a blocker. It is
     * flagged pending_review, the owner is nudged on Telegram, and the
     * proposal lands in the audit trail.
     */
    public function test_cashier_proposed_category_is_live_immediately_and_flagged_for_review(): void
    {
        Queue::fake();
        $cashier = Employee::where('role', 'cashier')->first();
        $headers = $this->auth($cashier);

        $created = $this->postJson(
            '/api/categories',
            ['name' => 'Pchum Ben Specials'],
            $headers,
        )
            ->assertCreated()
            ->assertJsonPath('name', 'Pchum Ben Specials')
            ->assertJsonPath('pendingReview', true)
            ->assertJsonPath('createdBy', $cashier->name)
            ->json();

        // Active + flagged: on sale now, reviewed later.
        $this->assertSame(1, (int) DB::table('categories')->where('id', $created['id'])->value('active'));
        $this->assertSame(1, (int) DB::table('categories')->where('id', $created['id'])->value('pending_review'));
        $this->assertSame(
            $cashier->id,
            (int) DB::table('categories')->where('id', $created['id'])->value('created_by_employee_id'),
        );

        // The category list the terminal renders chips from includes it, so
        // the very next cake can be filed under it.
        $list = $this->getJson('/api/categories', $headers)->assertOk()->json();
        $row = collect($list)->first(fn($c) => $c['id'] === $created['id']);
        $this->assertNotNull($row, 'a proposed category must appear in the list');
        $this->assertTrue($row['pendingReview']);
        $this->assertSame($cashier->name, $row['createdBy']);

        // The sale is not blocked: a product can use it immediately.
        $product = $this->postJson(
            '/api/products',
            [
                'name' => 'Knom Pchum Ben',
                'categoryId' => $created['id'],
                'price' => 3.5,
                'stock' => 4,
            ],
            $headers,
        )->assertCreated()->json();
        $this->assertSame('Pchum Ben Specials', $product['category']);
        $this->assertSame(
            $created['id'],
            (int) DB::table('products')->where('id', $product['id'])->value('category_id'),
        );

        // Owner nudge + accountability.
        Queue::assertPushedTimes(SendStaffCategoryProposedNotification::class, 1);
        $this->assertDatabaseHas('audit_events', [
            'action' => 'category.created_by_cashier',
            'employee_id' => $cashier->id,
        ]);

        // An admin creating a category is not a proposal: no flag, no nudge.
        $adminHeaders = $this->auth(Employee::where('role', 'admin')->first());
        $adminMade = $this->postJson(
            '/api/categories',
            ['name' => 'Wedding Cakes'],
            $adminHeaders,
        )
            ->assertCreated()
            ->assertJsonPath('pendingReview', false)
            ->json();
        $this->assertNull($adminMade['createdBy']);
        Queue::assertPushedTimes(SendStaffCategoryProposedNotification::class, 1);

        // Rejecting a category still in use is refused — no product is left
        // pointing at a dead category.
        $this->postJson(
            "/api/categories/{$created['id']}/review",
            ['action' => 'reject'],
            $adminHeaders,
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors('category');
        $this->assertSame(1, (int) DB::table('categories')->where('id', $created['id'])->value('active'));

        // Approving keeps it and clears the flag.
        $this->postJson(
            "/api/categories/{$created['id']}/review",
            ['action' => 'approve'],
            $adminHeaders,
        )
            ->assertOk()
            ->assertJsonPath('pendingReview', false);
        $this->assertSame(0, (int) DB::table('categories')->where('id', $created['id'])->value('pending_review'));
        $this->assertSame(1, (int) DB::table('categories')->where('id', $created['id'])->value('active'));
        $this->assertDatabaseHas('audit_events', [
            'action' => 'category.approved',
            'employee_id' => Employee::where('role', 'admin')->first()->id,
        ]);
    }

    public function test_rejecting_an_unused_proposed_category_takes_it_off_the_menu(): void
    {
        Queue::fake();
        $cashier = Employee::where('role', 'cashier')->first();
        $proposed = $this->postJson(
            '/api/categories',
            ['name' => 'Cofee'],
            $this->auth($cashier),
        )->assertCreated()->json();
        $adminHeaders = $this->auth(Employee::where('role', 'admin')->first());

        // Nothing uses it, so rejecting works and deactivates it.
        $this->postJson(
            "/api/categories/{$proposed['id']}/review",
            ['action' => 'reject'],
            $adminHeaders,
        )
            ->assertOk()
            ->assertJsonPath('pendingReview', false);
        $this->assertSame(0, (int) DB::table('categories')->where('id', $proposed['id'])->value('active'));
        $this->assertSame(0, (int) DB::table('categories')->where('id', $proposed['id'])->value('pending_review'));
        $this->assertDatabaseHas('audit_events', ['action' => 'category.rejected']);

        // It disappears from the picker list (which only serves active ones).
        $list = $this->getJson('/api/categories', $adminHeaders)->assertOk()->json();
        $this->assertNull(collect($list)->first(fn($c) => $c['id'] === $proposed['id']));
    }

    /**
     * Subcategory placement is a taxonomy decision, so it stays admin-only:
     * a cashier is never silently granted (or silently stripped of) it.
     */
    public function test_cashier_cannot_place_a_category_under_a_parent(): void
    {
        Queue::fake();
        $cashier = Employee::where('role', 'cashier')->first();
        $adminHeaders = $this->auth(Employee::where('role', 'admin')->first());
        $parent = $this->postJson(
            '/api/categories',
            ['name' => 'Drinks Counter'],
            $adminHeaders,
        )->assertCreated()->json();

        $this->postJson(
            '/api/categories',
            ['name' => 'Iced Coffee', 'parentCategoryId' => $parent['id']],
            $this->auth($cashier),
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors('parentCategoryId');
        $this->assertDatabaseMissing('categories', ['name' => 'Iced Coffee']);

        // Review is owner-only too.
        $this->postJson(
            "/api/categories/{$parent['id']}/review",
            ['action' => 'approve'],
            $this->auth($cashier),
        )->assertForbidden();
        $this->postJson(
            "/api/categories/{$parent['id']}/review",
            ['action' => 'keep'],
            $adminHeaders,
        )->assertUnprocessable()->assertJsonValidationErrors('action');
    }

    public function test_deactivating_or_zeroing_stock_requires_a_reason_and_writes_audit_events(): void
    {
        $admin = Employee::where('role', 'admin')->first();
        $headers = $this->auth($admin);
        $product = Product::where('stock', '>', 0)->where('active', true)->first();

        // Deactivating without a reason is refused and changes nothing.
        $this->putJson(
            "/api/products/{$product->id}",
            ['active' => false],
            $headers,
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reasonCode');
        $this->assertTrue((bool) $product->fresh()->active);

        // With a reason it succeeds and the accountability trail records
        // who/when/why plus the before/after state.
        $this->putJson(
            "/api/products/{$product->id}",
            ['active' => false, 'reasonCode' => 'seasonal_return', 'reasonNote' => 'Back for New Year'],
            $headers,
        )->assertOk();
        $this->assertFalse((bool) $product->fresh()->active);

        // Manually zeroing stock needs its own reason event.
        $evergreen = Product::where('stock', '>', 0)->first();
        $this->putJson(
            "/api/products/{$evergreen->id}",
            ['stock' => 0, 'reasonCode' => 'out_of_stock'],
            $headers,
        )->assertOk();
        $this->assertSame(0, (int) $evergreen->fresh()->stock);

        // Zeroing an already-zero stock is not a new event.
        $this->putJson(
            "/api/products/{$evergreen->id}",
            ['stock' => 0, 'reasonCode' => 'out_of_stock'],
            $headers,
        )->assertOk();

        // The audit endpoint surfaces them, filterable per product.
        $rows = $this->getJson(
            "/api/reports/audit?productId={$product->id}",
            $headers,
        )
            ->assertOk()
            ->json();
        $this->assertCount(1, $rows);
        $this->assertSame('product.deactivated', $rows[0]['action']);
        $this->assertSame($admin->name, $rows[0]['employee']);
        $this->assertSame('seasonal_return', $rows[0]['details']['reasonCode']);
        $this->assertSame('Back for New Year', $rows[0]['details']['reasonNote']);
        $this->assertSame(true, $rows[0]['details']['activeBefore']);
        $this->assertSame(false, $rows[0]['details']['activeAfter']);

        $zeroRows = $this->getJson(
            "/api/reports/audit?productId={$evergreen->id}",
            $headers,
        )->assertOk()->json();
        $this->assertSame('product.stock_zeroed', $zeroRows[0]['action']);
        $this->assertGreaterThan(0, $zeroRows[0]['details']['stockBefore']);
        $this->assertSame(0, $zeroRows[0]['details']['stockAfter']);

        // A century-wide audit window is refused (the 366-day cap). The
        // catalog editor's product-reason lookup sends only productId and
        // must not 422 — that path is all-time for one product.
        $this->getJson(
            '/api/reports/audit?from=2000-01-01&to=2099-12-31',
            $headers,
        )->assertUnprocessable();
        $this->getJson(
            "/api/reports/audit?productId={$product->id}",
            $headers,
        )->assertOk();
    }

    /**
     * Mixed-currency split tender: $8.00 + ៛8,200 at the configured 4100
     * rate exactly covers a $10.00 total. Both tendered amounts must be
     * recorded as distinct per-currency values and flow into the shift's
     * per-currency expected drawer / variance.
     */
    public function test_mixed_currency_cash_payment_records_both_tenders_and_reconciles_by_currency(): void
    {
        $cashier = Employee::where('role', 'cashier')->first();
        $headers = $this->auth($cashier);
        $this->assertSame(4100, \App\Support\ExchangeRate::current());

        $this->postJson(
            '/api/shifts/open',
            ['openingCash' => '100.00', 'openingCashKhr' => 40000],
            $headers,
        )->assertCreated();

        $product = Product::first();
        $product->update(['price_cents' => 1000, 'stock' => 10]); // $10.00

        $orderId = $this->postJson(
            '/api/orders',
            [
                'payment' => 'Cash',
                'items' => [['productId' => $product->id, 'quantity' => 1]],
                'idempotencyKey' => (string) Str::uuid(),
                'usdReceivedCents' => 800,
                'khrReceived' => 8200,
                'changeUsdCents' => 0,
                'changeKhr' => 0,
                'exchangeRateKhrPerUsd' => 4100,
            ],
            $headers,
        )
            ->assertCreated()
            ->json('id');

        $payment = DB::table('order_payments')->where('order_id', $orderId)->first();
        $this->assertSame(800, (int) $payment->tendered_usd_cents);
        $this->assertSame(8200, (int) $payment->tendered_khr);
        $this->assertSame(0, (int) $payment->change_usd_cents);
        $this->assertSame(0, (int) $payment->change_khr);
        $this->assertSame(4100, (int) $payment->exchange_rate_khr_per_usd);

        // Short tender (USD alone below the total) must be refused.
        $this->postJson(
            '/api/orders',
            [
                'payment' => 'Cash',
                'items' => [['productId' => $product->id, 'quantity' => 1]],
                'idempotencyKey' => (string) Str::uuid(),
                'usdReceivedCents' => 500,
                'khrReceived' => 0,
            ],
            $headers,
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors('payment');

        // The open shift's expected drawer is tracked per currency.
        $current = $this->getJson('/api/shifts/current', $headers)
            ->assertOk()
            ->json();
        $this->assertSame(10000 + 800, $current['expectedCashUsdCents']);
        $this->assertSame(40000 + 8200, $current['expectedCashKhr']);

        // Closing with both physical piles counted exact → zero variance in
        // BOTH currencies (never a blended USD-equivalent number).
        $closed = $this->postJson(
            '/api/shifts/close',
            ['closingCash' => '108.00', 'closingCashKhr' => 48200],
            $headers,
        )->assertOk()->json();
        $this->assertSame(0.0, $closed['variance']);
        $shift = DB::table('shifts')->latest('id')->first();
        $this->assertSame(0, (int) $shift->variance_usd_cents);
        $this->assertSame(0, (int) $shift->variance_khr);
    }

    /**
     * Item 10: a completed sale must actually DISPATCH and SEND the staff
     * Telegram message — asserted against the real HTTP call the queued job
     * makes, not just the job class existing.
     */
    public function test_completed_sale_dispatches_and_sends_staff_telegram_notification(): void
    {
        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
        config([
            'services.telegram.staff_bot_token' => '123:staff-token',
        ]);
        $cashier = Employee::where('role', 'cashier')->first();
        $product = Product::first();
        $product->update(['price_cents' => 1250, 'stock' => 20]);

        $orderId = $this->createPaidOrder($cashier, $product, 'Cash', 2);

        // QUEUE_CONNECTION=sync in the test env: the queued job has already
        // run inside the request. Assert the real sendMessage was sent.
        Http::assertSent(
            fn($request) => str_contains(
                $request->url(),
                'bot123:staff-token/sendMessage',
            ) &&
                str_contains((string) $request['text'], $orderId) &&
                str_contains((string) $request['text'], 'Order completed') &&
                str_contains((string) $request['text'], '25.00') &&
                str_contains((string) $request['text'], $cashier->name),
        );
    }

    /**
     * Hold ("park") a walk-in order: the customer orders, leaves, and pays
     * when they come back. The order must be visible in the held queue and
     * its stock must be RESERVED, not sold.
     */
    private function holdOrder(
        Employee $employee,
        Product $product,
        int $quantity = 1,
        array $extra = [],
    ): array {
        $this->openShiftIfNone($employee);
        return $this->postJson(
            '/api/orders/hold',
            array_merge(
                [
                    'items' => [
                        ['productId' => $product->id, 'quantity' => $quantity],
                    ],
                ],
                $extra,
            ),
            $this->auth($employee),
        )
            ->assertCreated()
            ->json();
    }

    public function test_holding_an_order_parks_it_and_reserves_stock(): void
    {
        $cashier = Employee::where('role', 'cashier')->first();
        $product = Product::first();
        $product->update(['price_cents' => 1000, 'stock' => 10]);

        $held = $this->holdOrder($cashier, $product, 2, [
            'holdLabel' => 'Dara — 4pm',
        ]);

        $this->assertSame('Held', $held['status']);
        $this->assertSame('unpaid', $held['paymentStatus']);
        $this->assertSame('Dara — 4pm', $held['holdLabel']);
        $this->assertSame(20.0, (float) $held['total']);
        // Reserved, not sold: the shelf count is untouched.
        $this->assertSame(2, (int) $product->fresh()->reserved_stock);
        $this->assertSame(10, (int) $product->fresh()->stock);
        // No payment row and no shift money until the customer pays.
        $this->assertDatabaseCount('order_payments', 0);

        $queue = $this->getJson('/api/orders/held', $this->auth($cashier))
            ->assertOk()
            ->json();
        $this->assertCount(1, $queue);
        $this->assertSame($held['id'], $queue[0]['id']);
        $this->assertSame('Dara — 4pm', $queue[0]['holdLabel']);
        // Line items come back so the terminal can resume the hold.
        $this->assertSame($product->id, $queue[0]['lineItems'][0]['productId']);
        $this->assertSame(2, $queue[0]['lineItems'][0]['quantity']);
    }

    public function test_many_orders_can_be_held_at_once_oldest_first(): void
    {
        $cashier = Employee::where('role', 'cashier')->first();
        $product = Product::first();
        // One product, three separate holds: how many tickets can be parked
        // at once must not depend on how big the catalogue is.
        $product->update(['price_cents' => 1000, 'stock' => 10]);

        $first = $this->holdOrder($cashier, $product, 1, [
            'holdLabel' => 'First',
        ]);
        $this->travel(1)->minutes();
        $second = $this->holdOrder($cashier, $product, 1, [
            'holdLabel' => 'Second',
        ]);
        $this->travel(1)->minutes();
        $third = $this->holdOrder($cashier, $product, 1);
        $this->assertSame(3, (int) $product->fresh()->reserved_stock);

        $queue = $this->getJson('/api/orders/held', $this->auth($cashier))
            ->assertOk()
            ->json();
        $this->assertCount(3, $queue);
        // It is a queue: the longest-waiting customer is served first.
        $this->assertSame(
            [$first['id'], $second['id'], $third['id']],
            [$queue[0]['id'], $queue[1]['id'], $queue[2]['id']],
        );
        // Each hold keeps its own label; an unlabelled one still shows up.
        $this->assertSame('First', $queue[0]['holdLabel']);
        $this->assertNull($queue[2]['holdLabel']);
        $this->travelBack();
    }

    public function test_paying_a_held_order_directly_stops_it_being_held(): void
    {
        $cashier = Employee::where('role', 'cashier')->first();
        $product = Product::first();
        $product->update(['price_cents' => 1000, 'stock' => 10]);

        $held = $this->holdOrder($cashier, $product, 2, [
            'holdLabel' => 'Srey — tomorrow',
        ]);

        $this->postJson(
            "/api/orders/{$held['id']}/pay",
            [
                'method' => 'Cash',
                'usdReceivedCents' => 2000,
                'changeUsdCents' => 0,
                'changeKhr' => 0,
                'exchangeRateKhrPerUsd' => 4100,
            ],
            $this->auth($cashier),
        )->assertOk();

        $this->assertSame(
            'Completed',
            DB::table('orders')->where('id', $held['id'])->value('status'),
        );
        $this->assertSame(
            'paid',
            DB::table('orders')->where('id', $held['id'])->value('payment_status'),
        );
        // Reservation released, stock actually sold.
        $this->assertSame(0, (int) $product->fresh()->reserved_stock);
        $this->assertSame(8, (int) $product->fresh()->stock);
        // …and the hold is gone from the queue.
        $queue = $this->getJson('/api/orders/held', $this->auth($cashier))
            ->assertOk()
            ->json();
        $this->assertSame([], $queue);
    }

    /**
     * The flow the owner asked for: a hold is resumed into the cart, the
     * customer comes back and pays, and the hold stops being held — with its
     * reserved stock released and no double-counted revenue.
     */
    public function test_checking_out_a_resumed_hold_releases_it(): void
    {
        $cashier = Employee::where('role', 'cashier')->first();
        $product = Product::first();
        $product->update(['price_cents' => 1000, 'stock' => 10]);

        $held = $this->holdOrder($cashier, $product, 2, [
            'holdLabel' => 'Dara — pays on collection',
        ]);
        $this->assertSame(2, (int) $product->fresh()->reserved_stock);

        // The cashier resumes it: the new sale carries the hold's ids.
        $paid = $this->postJson(
            '/api/orders',
            [
                'payment' => 'Cash',
                'items' => [
                    ['productId' => $product->id, 'quantity' => 2],
                ],
                'idempotencyKey' => (string) Str::uuid(),
                'usdReceivedCents' => 1800,
                'khrReceived' => 8200,
                'changeUsdCents' => 0,
                'changeKhr' => 0,
                'exchangeRateKhrPerUsd' => 4100,
                'heldOrderIds' => [$held['id']],
            ],
            $this->auth($cashier),
        )
            ->assertCreated()
            ->json();

        $this->assertSame('Completed', $paid['status']);
        // Split tender must still be recorded as distinct per-currency values
        // in the resumed-and-checked-out path, not just the direct /pay path.
        $payment = DB::table('order_payments')
            ->where('order_id', $paid['id'])
            ->first();
        $this->assertSame(1800, (int) $payment->tendered_usd_cents);
        $this->assertSame(8200, (int) $payment->tendered_khr);
        $this->assertSame(0, (int) $payment->change_usd_cents);
        $this->assertSame(0, (int) $payment->change_khr);
        // The hold is released, not silently left parked.
        $this->assertSame(
            'Cancelled',
            DB::table('orders')->where('id', $held['id'])->value('status'),
        );
        $this->assertSame(
            [],
            $this->getJson('/api/orders/held', $this->auth($cashier))->json(),
        );
        // Reserved stock came back and the sale took it off the shelf once.
        $this->assertSame(0, (int) $product->fresh()->reserved_stock);
        $this->assertSame(8, (int) $product->fresh()->stock);
        // The release is in the accountability trail, tied to the paid order.
        $this->assertDatabaseHas('audit_events', [
            'action' => 'order.hold_released',
            'order_id' => $held['id'],
        ]);
        $details = json_decode(
            DB::table('audit_events')
                ->where('action', 'order.hold_released')
                ->value('details_json'),
            true,
        );
        $this->assertSame($paid['id'], $details['paidOrderId']);
        // Revenue counts the paid order only — never the released hold.
        $summary = $this->getJson(
            '/api/reports/summary',
            $this->auth(Employee::where('role', 'admin')->first()),
        )->assertOk()->json();
        $this->assertSame(2000, (int) round($summary['todaySalesTotal'] * 100));
        // Only the paid sale counts; the released hold is not an order.
        $this->assertSame(1, (int) $summary['todayOrdersCount']);
    }

    public function test_hold_release_is_idempotent_and_unknown_ids_are_rejected(): void
    {
        $cashier = Employee::where('role', 'cashier')->first();
        $product = Product::first();
        $product->update(['price_cents' => 1000, 'stock' => 10]);
        $held = $this->holdOrder($cashier, $product, 1);

        // An id that was never held is a client error, not a silent no-op.
        $this->postJson(
            '/api/orders',
            [
                'payment' => 'Cash',
                'items' => [
                    ['productId' => $product->id, 'quantity' => 1],
                ],
                'idempotencyKey' => (string) Str::uuid(),
                'usdReceivedCents' => 1000,
                'exchangeRateKhrPerUsd' => 4100,
                'heldOrderIds' => ['CS-999999'],
            ],
            $this->auth($cashier),
        )->assertUnprocessable()->assertJsonValidationErrors('heldOrderIds');

        // Releasing the same hold twice must not double-release the stock.
        $payload = [
            'payment' => 'Cash',
            'items' => [['productId' => $product->id, 'quantity' => 1]],
            'idempotencyKey' => (string) Str::uuid(),
            'usdReceivedCents' => 1000,
            'exchangeRateKhrPerUsd' => 4100,
            'heldOrderIds' => [$held['id']],
        ];
        $this->postJson('/api/orders', $payload, $this->auth($cashier))
            ->assertCreated();
        $this->assertSame(0, (int) $product->fresh()->reserved_stock);
        $this->assertSame(9, (int) $product->fresh()->stock);
        $payload['idempotencyKey'] = (string) Str::uuid();
        $this->postJson('/api/orders', $payload, $this->auth($cashier))
            ->assertCreated();
        $this->assertSame(0, (int) $product->fresh()->reserved_stock);
        $this->assertSame(8, (int) $product->fresh()->stock);
    }

    public function test_discarding_a_hold_gives_the_stock_back(): void
    {
        $cashier = Employee::where('role', 'cashier')->first();
        $product = Product::first();
        $product->update(['price_cents' => 1000, 'stock' => 10]);
        $held = $this->holdOrder($cashier, $product, 3);
        $this->assertSame(3, (int) $product->fresh()->reserved_stock);

        $this->postJson(
            "/api/orders/{$held['id']}/cancel",
            [],
            $this->auth($cashier),
        )->assertOk();

        $this->assertSame(0, (int) $product->fresh()->reserved_stock);
        $this->assertSame(10, (int) $product->fresh()->stock);
        $this->assertSame(
            [],
            $this->getJson('/api/orders/held', $this->auth($cashier))->json(),
        );
    }

    public function test_shop_webhook_start_sends_bilingual_welcome_with_mini_app_button(): void
    {
        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
        config([
            'services.telegram.bot_token' => '123:shop-token',
            'services.telegram.webhook_secret' => 'sekret',
            'services.telegram.shop_mini_app_url' => 'https://shop.gcake.test',
        ]);
        Setting::updateOrCreate(
            ['key' => 'business_profile'],
            [
                'value_json' => [
                    'businessName' => 'G-Cake',
                    'address' => 'St 63, Phnom Penh',
                    'phone' => '+85512345678',
                ],
                'updated_at' => now(),
            ],
        );

        $this->postJson(
            '/api/telegram/webhook',
            [
                'message' => [
                    'text' => '/start',
                    'from' => ['id' => 555, 'first_name' => 'Dara'],
                ],
            ],
            ['X-Telegram-Bot-Api-Secret-Token' => 'sekret'],
        )->assertOk();

        Http::assertSent(function ($request) {
            if (
                !str_contains(
                    $request->url(),
                    'bot123:shop-token/sendMessage',
                )
            ) {
                return false;
            }
            $text = (string) $request['text'];
            $markup = json_decode((string) $request['reply_markup'], true);
            $buttons = $markup['inline_keyboard'] ?? [];
            $primary = $buttons[0][0] ?? [];
            $secondary = $buttons[1][0] ?? [];
            return str_contains($text, 'សូមស្វាគមន៍') &&
                str_contains($text, 'Welcome to G-Cake') &&
                $primary['type'] === 'web_app' &&
                $primary['web_app']['url'] === 'https://shop.gcake.test' &&
                str_contains($primary['text'], 'Open Shop') &&
                $secondary['type'] === 'url' &&
                str_contains($secondary['url'], 'maps.google.com');
        });
    }

    public function test_customer_order_is_refused_when_no_cashier_is_on_shift(): void
    {
        config(['services.telegram.bot_token' => '123:test-token']);
        $this->assertFalse(Shift::where('status', 'Open')->exists());
        $initData = $this->signedInitData([
            'id' => 501,
            'first_name' => 'Closed',
            'username' => 'closed_shop',
        ]);
        Customer::where('telegram_user_id', '501')->update([
            'phone' => '+855 12 000 501',
        ]);
        $product = Product::first();
        $product->update(['price_cents' => 1000, 'stock' => 10]);
        $this->postJson('/api/customer-products', ['initData' => $initData])
            ->assertOk()
            ->assertJsonPath('storeOpen', false);
        $this->postJson('/api/customer-orders', [
            'initData' => $initData,
            'items' => [['productId' => $product->id, 'quantity' => 1]],
            'requestedTotal' => '10.00',
        ])
            ->assertStatus(409)
            ->assertJsonPath('store_closed', true);
        $this->assertSame(0, Order::where('source', 'telegram')->count());
    }

    public function test_accepting_a_pending_customer_order_parks_it_held_unpaid(): void
    {
        config(['services.telegram.bot_token' => '123:test-token']);
        $cashier = Employee::where('role', 'cashier')->first();
        $this->openShiftIfNone($cashier);
        $product = Product::first();
        $product->update(['price_cents' => 1000, 'stock' => 10]);
        $initData = $this->signedInitData([
            'id' => 502,
            'first_name' => 'Dara',
            'username' => 'dara',
        ]);
        $this->postJson('/api/customer-products', ['initData' => $initData])
            ->assertOk();
        Customer::where('telegram_user_id', '502')->update([
            'phone' => '+855 12 000 502',
        ]);
        $orderId = $this->postJson('/api/customer-orders', [
            'initData' => $initData,
            'items' => [['productId' => $product->id, 'quantity' => 1]],
            'requestedTotal' => '10.00',
        ])
            ->assertCreated()
            ->json('order.id');

        $this->postJson(
            "/api/orders/$orderId/accept",
            [],
            $this->auth($cashier),
        )
            ->assertOk()
            ->assertJsonPath('status', 'Held')
            ->assertJsonPath('paymentStatus', 'unpaid');

        $order = Order::find($orderId);
        $this->assertSame('Held', $order->status);
        $this->assertSame('unpaid', $order->payment_status);
        $this->assertSame('Held', $order->fulfillment_status);
        $this->assertDatabaseCount('order_payments', 0);
        $this->assertSame(1, (int) $product->fresh()->reserved_stock);
        $this->assertSame(10, (int) $product->fresh()->stock);
        $this->assertNotContains(
            $orderId,
            collect(
                $this->getJson(
                    '/api/orders/pending',
                    $this->auth($cashier),
                )->json(),
            )->pluck('id'),
        );
        $held = $this->getJson('/api/orders/held', $this->auth($cashier))
            ->assertOk()
            ->json();
        $this->assertSame($orderId, collect($held)->first()['id'] ?? null);
    }

    /**
     * The reported close-shift bug: $9 USD + ៛4,100 on a $10 sale must
     * count $9 of USD cash (not drop it) and ៛4,100 of riel independently.
     */
    public function test_nine_usd_plus_four_thousand_one_hundred_riel_counts_both_tenders(): void
    {
        $cashier = Employee::where('role', 'cashier')->first();
        $headers = $this->auth($cashier);
        $this->postJson(
            '/api/shifts/open',
            ['openingCash' => '100.00', 'openingCashKhr' => 40000],
            $headers,
        )->assertCreated();

        $product = Product::first();
        $product->update(['price_cents' => 1000, 'stock' => 10]);

        $payload = [
            'payment' => 'Cash',
            'items' => [['productId' => $product->id, 'quantity' => 1]],
            'idempotencyKey' => (string) Str::uuid(),
            'usdReceivedCents' => 900,
            'khrReceived' => 4100,
            'changeUsdCents' => 0,
            'changeKhr' => 0,
            'exchangeRateKhrPerUsd' => 4100,
        ];
        $orderId = $this->postJson('/api/orders', $payload, $headers)
            ->assertCreated()
            ->json('id');

        $payment = DB::table('order_payments')->where('order_id', $orderId)->first();
        $this->assertSame(900, (int) $payment->tendered_usd_cents);
        $this->assertSame(4100, (int) $payment->tendered_khr);
        $this->assertSame(0, (int) $payment->change_usd_cents);
        $this->assertSame(0, (int) $payment->change_khr);

        $current = $this->getJson('/api/shifts/current', $headers)
            ->assertOk()
            ->json();
        $this->assertSame(10000 + 900, $current['expectedCashUsdCents']);
        $this->assertSame(40000 + 4100, $current['expectedCashKhr']);
        $this->assertSame(900, $current['cashSalesUsdCents']);
        $this->assertSame(4100, $current['cashSalesKhr']);

        $closed = $this->postJson(
            '/api/shifts/close',
            ['closingCash' => '109.00', 'closingCashKhr' => 44100],
            $headers,
        )
            ->assertOk()
            ->json();
        $this->assertSame(0.0, $closed['variance']);
        $shift = DB::table('shifts')->latest('id')->first();
        $this->assertSame(0, (int) $shift->variance_usd_cents);
        $this->assertSame(0, (int) $shift->variance_khr);
        $this->assertSame(10900, (int) $shift->expected_cash_usd_cents);
        $this->assertSame(44100, (int) $shift->expected_cash_khr);
    }

    public function test_delayed_pay_records_both_usd_and_khr_tenders(): void
    {
        $cashier = Employee::where('role', 'cashier')->first();
        $headers = $this->auth($cashier);
        $this->openShiftIfNone($cashier);
        $product = Product::first();
        $product->update(['price_cents' => 1000, 'stock' => 10]);

        $held = $this->holdOrder($cashier, $product, 1, [
            'holdLabel' => 'Split delayed pay',
        ]);
        $this->postJson(
            "/api/orders/{$held['id']}/pay",
            [
                'method' => 'Cash',
                'usdReceivedCents' => 900,
                'khrReceived' => 4100,
                'changeUsdCents' => 0,
                'changeKhr' => 0,
                'exchangeRateKhrPerUsd' => 4100,
            ],
            $headers,
        )->assertOk();

        $payment = DB::table('order_payments')
            ->where('order_id', $held['id'])
            ->first();
        $this->assertSame(900, (int) $payment->tendered_usd_cents);
        $this->assertSame(4100, (int) $payment->tendered_khr);

        $current = $this->getJson('/api/shifts/current', $headers)
            ->assertOk()
            ->json();
        $this->assertSame(900, $current['cashSalesUsdCents']);
        $this->assertSame(4100, $current['cashSalesKhr']);
    }

    /**
     * The third payment-creation entry point: taking payment for a pending
     * Telegram customer order. Same critical split-tender invariant — the
     * $9 USD + ៛4,100 riel on a $10 order must be recorded as two distinct
     * per-currency tenders (never a KHR-only row that drops the USD half)
     * and flow into the open shift's expected drawer.
     */
    public function test_pending_customer_order_split_tender_records_both_usd_and_khr(): void
    {
        config(['services.telegram.bot_token' => '123:test-token']);
        $cashier = Employee::where('role', 'cashier')->first();
        $headers = $this->auth($cashier);
        $this->openShiftIfNone($cashier);
        $product = Product::first();
        $product->update(['price_cents' => 1000, 'stock' => 10]);
        $initData = $this->signedInitData([
            'id' => 503,
            'first_name' => 'Split',
            'username' => 'split_tender',
        ]);
        Customer::where('telegram_user_id', '503')->update([
            'phone' => '+855 12 000 503',
        ]);
        $orderId = $this->postJson('/api/customer-orders', [
            'initData' => $initData,
            'items' => [['productId' => $product->id, 'quantity' => 1]],
            'requestedTotal' => '10.00',
        ])
            ->assertCreated()
            ->json('order.id');

        $this->postJson(
            \"/api/orders/$orderId/pay\",
            [
                'method' => 'Cash',
                'usdReceivedCents' => 900,
                'khrReceived' => 4100,
                'changeUsdCents' => 0,
                'changeKhr' => 0,
                'exchangeRateKhrPerUsd' => 4100,
            ],
            $headers,
        )->assertOk();

        $payment = DB::table('order_payments')
            ->where('order_id', $orderId)
            ->first();
        $this->assertSame(900, (int) $payment->tendered_usd_cents);
        $this->assertSame(4100, (int) $payment->tendered_khr);
        $this->assertSame(0, (int) $payment->change_usd_cents);
        $this->assertSame(0, (int) $payment->change_khr);

        $current = $this->getJson('/api/shifts/current', $headers)
            ->assertOk()
            ->json();
        $this->assertSame(900, $current['cashSalesUsdCents']);
        $this->assertSame(4100, $current['cashSalesKhr']);
    }

    public function test_reports_losses_and_year_month_presets(): void
    {
        $admin = Employee::where('role', 'admin')->first();
        $cashier = Employee::where('role', 'cashier')->first();
        $product = Product::first();
        $product->update(['price_cents' => 2000, 'stock' => 50]);

        $this->postJson(
            '/api/shifts/open',
            ['openingCash' => '100.00'],
            $this->auth($cashier),
        )->assertCreated();
        $orderId = $this->postJson(
            '/api/orders',
            [
                'payment' => 'Cash',
                'items' => [['productId' => $product->id, 'quantity' => 1]],
                'discount' => ['type' => 'fixed', 'amount' => '2.00'],
                'idempotencyKey' => (string) Str::uuid(),
            ],
            $this->auth($cashier),
        )
            ->assertCreated()
            ->json('id');
        $this->postJson(
            '/api/shifts/close',
            ['closingCash' => '116.00'],
            $this->auth($cashier),
        )->assertOk();
        $this->postJson(
            "/api/orders/$orderId/corrections",
            ['type' => 'void', 'amount' => '3.00'],
            $this->auth($admin),
        )->assertCreated();
        $this->postJson(
            '/api/inventory/waste',
            [
                'productId' => $product->id,
                'quantity' => 1,
                'reason' => 'expired',
            ],
            $this->auth($admin),
        )->assertCreated();

        $losses = $this->getJson(
            '/api/reports/losses?preset=today',
            $this->auth($admin),
        )
            ->assertOk()
            ->json();
        $this->assertSame(2000, $losses['wasteCents']);
        $this->assertSame(200, $losses['discountsCents']);
        $this->assertSame(300, $losses['voidsCents']);
        $this->assertSame(0, $losses['refundsCents']);
        // Opening 100 + $18 cash sale = 118 expected; counted 116 → $2 short.
        $this->assertSame(200, $losses['cashShortagesCents']);
        $this->assertSame(2700, $losses['totalLostCents']);

        $this->getJson(
            '/api/reports/summary?preset=this_year',
            $this->auth($admin),
        )->assertOk();
        $this->getJson(
            '/api/reports/summary?preset=last_month',
            $this->auth($admin),
        )->assertOk();
        $this->getJson(
            '/api/reports/losses?preset=this_year',
            $this->auth($admin),
        )->assertOk();
    }
}

final class MoneyForTest
{
    public static function decimal(int $cents): float
    {
        return $cents / 100;
    }
}
