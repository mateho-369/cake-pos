<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $t) {
            $t->id();
            $t->string('telegram_user_id')->unique();
            $t->string('name');
            $t->string('phone')->nullable();
            $t->string('telegram_username')->nullable()->index();
            $t->timestamp('first_seen_at');
            $t->timestamp('updated_at');
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
