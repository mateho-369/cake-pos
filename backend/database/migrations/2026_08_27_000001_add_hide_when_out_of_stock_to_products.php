<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::table('products', function (Blueprint $t) {
            // Admin override (default off): when a product's stock hits 0 it
            // is shown as "Out of stock" on the customer storefront; with
            // this flag on it disappears entirely instead. Kept separate
            // from `active`, which stays the manual show/hide toggle.
            $t->boolean('hide_when_out_of_stock')
                ->default(false)
                ->after('active');
        });
    }
    public function down(): void
    {
        Schema::table('products', function (Blueprint $t) {
            $t->dropColumn('hide_when_out_of_stock');
        });
    }
};
