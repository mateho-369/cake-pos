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
            ]);
    }
}

final class MoneyForTest
{
    public static function decimal(int $cents): float
    {
        return $cents / 100;
    }
}
