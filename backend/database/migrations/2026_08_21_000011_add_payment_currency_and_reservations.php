<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::table('products', function (Blueprint $t) { $t->unsignedInteger('reserved_stock')->default(0)->after('stock'); });
        Schema::table('order_items', function (Blueprint $t) {
            $t->foreignId('product_id')->nullable()->change();
            $t->string('description')->nullable()->after('product_id');
            $t->unsignedBigInteger('line_subtotal_cents')->default(0);
            $t->unsignedBigInteger('line_discount_cents')->default(0);
            $t->unsignedBigInteger('line_total_cents')->default(0);
        });
        Schema::table('orders', function (Blueprint $t) {
            $t->string('payment_status')->default('unpaid')->index();
            $t->string('fulfillment_status')->nullable()->index();
        });
        DB::statement("ALTER TABLE orders MODIFY status VARCHAR(32) NOT NULL");
        Schema::create('order_payments', function (Blueprint $t) {
            $t->id(); $t->string('order_id'); $t->foreign('order_id')->references('id')->on('orders')->restrictOnDelete();
            $t->string('method', 64)->index(); $t->string('status', 16)->index();
            $t->unsignedBigInteger('amount_usd_cents'); $t->unsignedInteger('exchange_rate_khr_per_usd');
            $t->unsignedBigInteger('tendered_usd_cents')->nullable(); $t->unsignedBigInteger('tendered_khr')->nullable();
            $t->unsignedBigInteger('change_usd_cents')->nullable(); $t->unsignedBigInteger('change_khr')->nullable();
            $t->bigInteger('settlement_rounding_khr')->default(0); $t->string('external_reference')->nullable();
            $t->foreignId('confirmed_by_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $t->timestamp('confirmed_at')->nullable(); $t->json('metadata')->nullable(); $t->timestamps();
            $t->index(['order_id','status']);
        });
        Schema::create('order_status_events', function (Blueprint $t) {
            $t->id(); $t->string('order_id'); $t->foreign('order_id')->references('id')->on('orders')->cascadeOnDelete();
            $t->string('from_status')->nullable(); $t->string('to_status'); $t->foreignId('employee_id')->nullable()->constrained()->nullOnDelete(); $t->json('metadata')->nullable(); $t->timestamps();
        });
    }
    public function down(): void { Schema::dropIfExists('order_status_events'); Schema::dropIfExists('order_payments'); }
};
