<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A held ("parked") order needs a human label — with several holds on the
 * go at once the cashier has to be able to tell them apart ("Dara — 4pm").
 * Optional: falls back to the order code + time in the UI.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $t) {
            $t->string('hold_label')->nullable()->after('fulfillment_status');
        });
    }
    public function down(): void
    {
        Schema::table('orders', function (Blueprint $t) {
            $t->dropColumn('hold_label');
        });
    }
};
