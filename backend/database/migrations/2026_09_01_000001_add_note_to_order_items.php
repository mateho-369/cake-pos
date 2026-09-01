<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A customer ordering in the Telegram Mini App has to be able to say what
 * the cake must actually say or taste like — "Happy Birthday John", "less
 * sugar". The note belongs to the LINE, not the order: one basket can hold
 * a birthday cake with an inscription next to a plain iced coffee.
 *
 * Optional and short on purpose (200 chars): it is read out loud on the
 * staff pending card and inside the Telegram staff notification, so it has
 * to stay glanceable. Walk-in lines simply leave it null.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $t) {
            $t->string('note', 200)->nullable()->after('quantity');
        });
    }
    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $t) {
            $t->dropColumn('note');
        });
    }
};
