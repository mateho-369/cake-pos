<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('email')->nullable()->unique();
            $t->enum('role', ['admin', 'cashier']);
            $t->string('password_hash')->nullable();
            $t->string('pin_hash')->nullable();
            $t->boolean('active')->default(true)->index();
            $t->timestamp('created_at');
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('employees');
    }
};
