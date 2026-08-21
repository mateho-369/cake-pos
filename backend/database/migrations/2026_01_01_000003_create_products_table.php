<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('products', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->foreignId('category_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('price_cents');
            $t->unsignedInteger('stock')->default(0);
            $t->unsignedInteger('sold')->default(0);
            $t->unsignedBigInteger('revenue_cents')->default(0);
            $t->date('made_at');
            $t->date('best_before')->nullable();
            $t->string('image_position')->default('0% 0%');
            $t->text('image_url')->nullable();
            $t->boolean('active')->default(true)->index();
            $t->timestamps();
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
