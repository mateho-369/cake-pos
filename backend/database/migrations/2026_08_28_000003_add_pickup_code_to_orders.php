<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        // Short human-readable code (e.g. "K7QZ") shown to Telegram customers
        // and used by staff to look the order up on arrival.
        Schema::table('orders', function (Blueprint $t) {
            $t->string('pickup_code', 8)->nullable()->after('id')->index();
        });
    }
    public function down(): void
    {
        Schema::table('orders', function (Blueprint $t) {
            $t->dropColumn('pickup_code');
        });
    }
};
