<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One level of category hierarchy: a category may optionally point at a
 * parent category (e.g. "Coffee" under "Drinks"). Existing flat categories
 * keep parent_category_id = NULL and behave exactly as before.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $t) {
            $t
                ->foreignId('parent_category_id')
                ->nullable()
                ->after('id')
                ->constrained('categories')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $t) {
            $t->dropConstrainedForeignId('parent_category_id');
        });
    }
};
