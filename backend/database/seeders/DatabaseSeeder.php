<?php

namespace Database\Seeders;

use App\Models\{Category, Employee, Product, Setting};
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Support\Money;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();
        // Production safety: this seeder runs on every deploy (db:seed
        // --force), so the staff credentials must come from the
        // environment there — never from the fallbacks below, which exist
        // only so local/CI databases come up without configuration.
        // Deliberately env('APP_ENV'), not app()->environment(): the
        // latter defaults to production when .env has no APP_ENV at all
        // (CI), and the guard is about a deploy that explicitly says so.
        if (env('APP_ENV') === 'production') {
            foreach (
                [
                    'SEED_ADMIN_PASSWORD',
                    'SEED_ADMIN_PIN',
                    'SEED_CASHIER_PASSWORD',
                    'SEED_CASHIER_PIN',
                ]
                as $key
            ) {
                if (env($key) === null || env($key) === '') {
                    throw new \RuntimeException(
                        "Seeder aborted: {$key} must be set in production.",
                    );
                }
            }
        }
        $employees = [
            [
                'name' => 'Makara Piseth',
                'email' => env('SEED_ADMIN_EMAIL', 'owner@atelier.local'),
                'role' => 'admin',
                'password_hash' => Hash::make(
                    env('SEED_ADMIN_PASSWORD', 'ChangeMe123!'),
                ),
                'pin_hash' => Hash::make(env('SEED_ADMIN_PIN', '9999')),
            ],
            [
                'name' => 'Sophea Chan',
                'email' => env('SEED_CASHIER_EMAIL', 'sophea@atelier.local'),
                'role' => 'cashier',
                'password_hash' => Hash::make(
                    env('SEED_CASHIER_PASSWORD', 'ChangeMe123!'),
                ),
                'pin_hash' => Hash::make(env('SEED_CASHIER_PIN', '1234')),
            ],
        ];
        // Optional third staff member: only seeded when BOTH credentials
        // are supplied, so no account ever ships with a fixed PIN.
        if (env('SEED_CASHIER_3_PASSWORD') && env('SEED_CASHIER_3_PIN')) {
            $employees[] = [
                'name' => 'Dara Lim',
                'email' => env('SEED_CASHIER_3_EMAIL', 'dara@atelier.local'),
                'role' => 'cashier',
                'password_hash' => Hash::make(env('SEED_CASHIER_3_PASSWORD')),
                'pin_hash' => Hash::make(env('SEED_CASHIER_3_PIN')),
            ];
        }
        foreach ($employees as $row) {
            Employee::firstOrCreate(
                ['email' => $row['email']],
                $row + ['active' => true, 'created_at' => $now],
            );
        }
        if ($this->shouldSeedDemoCatalog()) {
            $this->seedDemoCatalog();
        }
        Setting::firstOrCreate(
            ['key' => 'pos_rules'],
            [
                'value_json' => [
                    'maxCashierDiscountPercent' => 10,
                    'khqrImageUrl' => env('KHQR_IMAGE_URL', ''),
                ],
                'updated_at' => $now,
            ],
        );
        Setting::firstOrCreate(
            ['key' => 'receipt_template'],
            [
                'value_json' => [
                    'paperSize' => '80mm',
                    'language' => 'en',
                    'businessName' => 'Atelier Cake Shop',
                    'address' => 'Street 63, BKK1, Phnom Penh',
                    'logoUrl' => '',
                    'footerMessage' => 'Thank you for your order!',
                ],
                'updated_at' => $now,
            ],
        );
    }

    /**
     * Demo catalog is useful for local development and feature tests, but must
     * never be reintroduced into a production store on every deploy. Real
     * stores manage their catalog through the admin app.
     */
    private function shouldSeedDemoCatalog(): bool
    {
        return app()->environment('local', 'testing');
    }

    private function seedDemoCatalog(): void
    {
        $categories = [
            ['Signature', '#be185d'],
            ['Whole cakes', '#3b82f6'],
            ['Mini cakes', '#7c3aed'],
            ['Slices', '#d97706'],
            ['Cupcakes', '#ec4899'],
            ['Drinks', '#059669'],
            ['Chocolate', '#92400e'],
            ['Birthday Cakes', '#2563eb'],
            ['Cheesecakes', '#d97706'],
            ['Party Hats', '#f59e0b'],
            ['Party Decor', '#8b5cf6'],
            ['Party Supplies', '#06b6d4'],
            ['Toys & Games', '#10b981'],
        ];
        foreach ($categories as $i => $row) {
            Category::firstOrCreate(
                ['name' => $row[0]],
                ['color' => $row[1], 'active' => true, 'sort_order' => $i + 1],
            );
        }
        // One level of hierarchy, demo only (local/testing): a couple of
        // subcategories under existing parents so the grouping UI has real
        // data in development. Production taxonomy is admin-managed only.
        $demoParents = ['Drinks' => 'Coffee', 'Party Supplies' => 'Balloons'];
        foreach ($demoParents as $parentName => $childName) {
            $parent = Category::where('name', $parentName)->first();
            if ($parent) {
                Category::firstOrCreate(
                    ['name' => $childName],
                    [
                        'color' => '#be185d',
                        'active' => true,
                        'sort_order' => $parent->sort_order + 1,
                        'parent_category_id' => $parent->id,
                    ],
                );
            }
        }
        $products = [
            [
                'Strawberry Cloud',
                'Signature',
                28,
                4,
                '2026-08-20',
                '2026-08-23',
                '0% 0%',
            ],
            [
                'Dark Ganache',
                'Whole cakes',
                32,
                2,
                '2026-08-18',
                '2026-08-21',
                '50% 0%',
            ],
            [
                'Matcha Pistachio',
                'Signature',
                34,
                7,
                '2026-08-20',
                '2026-08-23',
                '100% 0%',
            ],
            [
                'Berry Basque',
                'Whole cakes',
                30,
                3,
                '2026-08-17',
                '2026-08-20',
                '0% 100%',
            ],
            [
                'Raspberry Petite',
                'Mini cakes',
                12,
                9,
                '2026-08-20',
                '2026-08-23',
                '50% 100%',
            ],
            [
                'Cocoa Cupcake Trio',
                'Cupcakes',
                9,
                8,
                '2026-08-19',
                '2026-08-21',
                '100% 100%',
            ],
            [
                'Strawberry Slice',
                'Slices',
                5.5,
                12,
                '2026-08-20',
                '2026-08-22',
                '0% 0%',
            ],
            [
                'Ganache Slice',
                'Slices',
                6,
                10,
                '2026-08-20',
                '2026-08-22',
                '50% 0%',
            ],
            [
                'Matcha Mini',
                'Mini cakes',
                11,
                6,
                '2026-08-19',
                '2026-08-20',
                '100% 0%',
            ],
            [
                'Basque Slice',
                'Slices',
                6.5,
                5,
                '2026-08-19',
                '2026-08-21',
                '0% 100%',
            ],
            [
                'Raspberry Celebration',
                'Whole cakes',
                38,
                3,
                '2026-08-20',
                '2026-08-23',
                '50% 100%',
            ],
            [
                'Chocolate Cupcake',
                'Cupcakes',
                3.5,
                14,
                '2026-08-20',
                '2026-08-22',
                '100% 100%',
            ],
            ['Iced Latte', 'Drinks', 3.5, 30, '2026-08-20', null, '50% 0%'],
            ['Americano', 'Drinks', 2.5, 30, '2026-08-20', null, '50% 0%'],
        ];
        foreach ($products as $row) {
            Product::firstOrCreate(
                ['name' => $row[0]],
                [
                    'category_id' => Category::where('name', $row[1])->value(
                        'id',
                    ),
                    'price_cents' => Money::fromDecimal($row[2]),
                    'stock' => $row[3],
                    'sold' => 0,
                    'revenue_cents' => 0,
                    'made_at' => $row[4],
                    'best_before' => $row[5],
                    'image_position' => $row[6],
                    'active' => true,
                ],
            );
        }
    }
}
