<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('shifts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('employee_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('opening_cash_cents');
            $t->unsignedBigInteger('closing_cash_cents')->nullable();
            $t->unsignedBigInteger('expected_cash_cents')->nullable();
            $t->bigInteger('variance_cents')->nullable();
            $t->timestamp('opened_at')->index();
            $t->timestamp('closed_at')->nullable();
            $t->enum('status', ['Open', 'Closed'])->index();
            $t->index(['employee_id', 'status']);
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('shifts');
    }
};
