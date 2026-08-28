<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cashier-proposed categories: a cashier can create a category on the spot
 * when the owner tells them to ("add a Seasonal category for this"), and it
 * is usable immediately — but it is flagged pending_review so the owner gets
 * a Telegram nudge and can approve or reject it in Admin > Categories.
 *
 * Existing rows stay pending_review = false (i.e. already approved).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $t) {
            $t->boolean('pending_review')->default(false)->after('sort_order');
            $t->foreignId('created_by_employee_id')
                ->nullable()
                ->after('pending_review')
                ->constrained('employees')
                ->nullOnDelete();
            // Category has no timestamps; the proposal time is what the admin
            // review panel needs ("who asked for this, and when").
            $t->timestamp('created_at')->nullable()->after('color');
        });
    }
    public function down(): void
    {
        Schema::table('categories', function (Blueprint $t) {
            $t->dropConstrainedForeignId('created_by_employee_id');
            $t->dropColumn('pending_review');
            $t->dropColumn('created_at');
        });
    }
};
