<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::table('shifts', function (Blueprint $t) {
            $t->foreignId('opened_by_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $t->foreignId('closed_by_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $t->unsignedBigInteger('opening_cash_usd_cents')->default(0); $t->unsignedBigInteger('opening_cash_khr')->default(0);
            $t->unsignedBigInteger('expected_cash_usd_cents')->nullable(); $t->unsignedBigInteger('expected_cash_khr')->nullable();
            $t->unsignedBigInteger('closing_cash_usd_cents')->nullable(); $t->unsignedBigInteger('closing_cash_khr')->nullable();
            $t->bigInteger('variance_usd_cents')->nullable(); $t->bigInteger('variance_khr')->nullable();
        });
        Schema::create('store_shift_locks', function (Blueprint $t) { $t->unsignedTinyInteger('id')->primary(); $t->timestamps(); });
    }
    public function down(): void { Schema::dropIfExists('store_shift_locks'); }
};
