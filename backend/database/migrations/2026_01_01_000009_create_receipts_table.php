<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('receipts', function (Blueprint $t) {
            $t->string('order_id')->primary();
            $t->foreign('order_id')
                ->references('id')
                ->on('orders')
                ->cascadeOnDelete();
            $t->json('snapshot_json');
            $t->timestamp('created_at');
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('receipts');
    }
};
