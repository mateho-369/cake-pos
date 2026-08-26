<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One-time data cleanup for the old DatabaseSeeder demo catalog.
 *
 * This cannot run as part of a repeatable seeder: every deploy previously
 * re-inserted the fake product/category list, so we remove it once here and
 * stop the seeder from creating demo catalog data in production.
 *
 * Products that are referenced by historical order_items are deactivated
 * rather than hard-deleted so foreign keys and past receipts stay intact.
 */
return new class extends Migration {
    public function up(): void
    {
        $demoProductNames = [
            'Strawberry Cloud',
            'Dark Ganache',
            'Matcha Pistachio',
            'Berry Basque',
            'Raspberry Petite',
            'Cocoa Cupcake Trio',
            'Strawberry Slice',
            'Ganache Slice',
            'Matcha Mini',
            'Basque Slice',
            'Raspberry Celebration',
            'Chocolate Cupcake',
            'Iced Latte',
            'Americano',
        ];

        $products = DB::table('products')
            ->whereIn('name', $demoProductNames)
            ->get(['id', 'name']);

        foreach ($products as $product) {
            $hasOrders = DB::table('order_items')
                ->where('product_id', $product->id)
                ->exists();

            if ($hasOrders) {
                DB::table('products')
                    ->where('id', $product->id)
                    ->update(['active' => false, 'updated_at' => now()]);
            } else {
                DB::table('product_images')
                    ->where('product_id', $product->id)
                    ->delete();
                DB::table('products')->where('id', $product->id)->delete();
            }
        }

        // Remove categories that only existed for the demo catalog. Leave any
        // category that a real product (or active product) still references.
        $demoCategoryNames = [
            'Signature',
            'Whole cakes',
            'Mini cakes',
            'Slices',
            'Cupcakes',
            'Drinks',
            'Chocolate',
            'Birthday Cakes',
            'Cheesecakes',
            'Party Hats',
            'Party Decor',
            'Party Supplies',
            'Toys & Games',
        ];

        foreach ($demoCategoryNames as $name) {
            $category = DB::table('categories')->where('name', $name)->first();
            if (!$category) {
                continue;
            }
            $hasProducts = DB::table('products')
                ->where('category_id', $category->id)
                ->exists();
            if (!$hasProducts) {
                DB::table('categories')->where('id', $category->id)->delete();
            }
        }
    }

    public function down(): void
    {
        // Intentionally a no-op: restoring demo data is not desirable after it
        // has been removed from a real store.
    }
};
