<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('broadcasts', function (Blueprint $t) {
            $t->id();
            $t->text('message');
            $t->unsignedInteger('recipient_count')->default(0);
            $t->unsignedInteger('success_count')->default(0);
            $t->unsignedInteger('failure_count')->default(0);
            $t->foreignId('created_by_employee_id')
                ->nullable()
                ->constrained('employees')
                ->nullOnDelete();
            $t->timestamp('sent_at')->nullable();
            $t->timestamps();
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('broadcasts');
    }
};
