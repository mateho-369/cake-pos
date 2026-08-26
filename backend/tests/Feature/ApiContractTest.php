<?php
namespace Tests\Feature;

use App\Models\{Employee, Order, Product, Setting};
use App\Services\ObjectUploadService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Storage};
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
        $sql = [];
        DB::listen(function ($query) use (&$sql) {
            $sql[] = $query->sql;
        });
        $employee = Employee::where('role', 'cashier')->first();
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
}

final class MoneyForTest
{
    public static function decimal(int $cents): float
    {
        return $cents / 100;
    }
}
