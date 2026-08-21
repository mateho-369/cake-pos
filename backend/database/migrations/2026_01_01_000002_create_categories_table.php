<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $t) {
            $t->id();
            $t->string('name')->unique();
            $t->string('color', 20)->default('#be185d');
            $t->boolean('active')->default(true)->index();
            $t->unsignedInteger('sort_order')->default(0)->index();
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('categories');
    }
};
