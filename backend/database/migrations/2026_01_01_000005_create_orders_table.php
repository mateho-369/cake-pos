<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $t) {
            $t->string('id')->primary();
            $t->foreignId('cashier_id')
                ->nullable()
                ->constrained('employees')
                ->nullOnDelete();
            $t->foreignId('customer_id')
                ->nullable()
                ->constrained()
                ->nullOnDelete();
            $t->string('parent_order_id')->nullable();
            $t->foreign('parent_order_id')
                ->references('id')
                ->on('orders')
                ->restrictOnDelete();
            $t->uuid('idempotency_key')->nullable()->unique();
            $t->enum('source', ['walk-in', 'telegram'])
                ->default('walk-in')
                ->index();
            $t->string('time');
            $t->string('date');
            $t->unsignedInteger('items');
            $t->unsignedBigInteger('subtotal_cents');
            $t->enum('discount_type', ['percentage', 'fixed'])->nullable();
            $t->unsignedInteger('discount_value')
                ->nullable()
                ->comment('basis points for percentage; cents for fixed');
            $t->unsignedBigInteger('discount_amount_cents')->default(0);
            $t->bigInteger('total_cents');
            $t->enum('payment', ['Cash', 'KHQR'])->nullable();
            $t->enum('status', [
                'Pending',
                'Confirmed',
                'Paid',
                'Ready',
                'Completed',
                'Refunded',
                'Voided',
            ])->index();
            $t->json('detail_json');
            $t->timestamp('created_at')->index();
            $t->timestamp('updated_at')->nullable();
            $t->index('parent_order_id');
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
