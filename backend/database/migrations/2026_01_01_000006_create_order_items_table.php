<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('order_items', function (Blueprint $t) {
            $t->id();
            $t->string('order_id');
            $t->foreign('order_id')
                ->references('id')
                ->on('orders')
                ->cascadeOnDelete();
            $t->foreignId('product_id')->constrained()->restrictOnDelete();
            $t->unsignedInteger('quantity');
            $t->unsignedBigInteger('unit_price_cents');
            $t->index(['order_id', 'product_id']);
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('order_items');
    }
};
