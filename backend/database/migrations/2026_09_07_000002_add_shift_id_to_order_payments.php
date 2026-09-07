<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::table('order_payments', function (Blueprint $t) {
            // Which shift a cash/QR payment counts against, set at
            // confirmation time. ShiftService::cashSalesSince() used to
            // attribute payments to a shift by confirmed_at >=
            // shift.opened_at alone — both columns have only second
            // precision, so a payment confirmed in the same wall-clock
            // second the NEXT shift opened was double-counted into that
            // next shift's expected cash too. Nullable: existing rows
            // predate this column, and cashSalesSince() falls back to the
            // old timestamp comparison only for those.
            $t->foreignId('shift_id')
                ->nullable()
                ->after('order_id')
                ->constrained('shifts')
                ->nullOnDelete();
        });
    }
    public function down(): void
    {
        Schema::table('order_payments', function (Blueprint $t) {
            $t->dropConstrainedForeignId('shift_id');
        });
    }
};
