<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('order_number_sequences', function (Blueprint $t) {
            // One row per order-id prefix (CS/RF/TG/...), locked with
            // lockForUpdate() to hand out the next number atomically —
            // see App\Services\OrderNumberSequence. Replaces a MAX(id)+1
            // scan of the whole orders table, which let two concurrent
            // order creations compute the same "next" number.
            $t->string('prefix', 8)->primary();
            $t->unsignedBigInteger('next_number')->default(1);
            $t->timestamps();
        });
        // Seed each known prefix from whatever is already in the orders
        // table, so numbering continues where it left off instead of
        // colliding with (or restarting behind) existing order ids.
        foreach (['CS', 'RF', 'TG'] as $prefix) {
            $max = DB::table('orders')
                ->where('id', 'like', "{$prefix}-%")
                ->pluck('id')
                ->reduce(
                    fn($carry, $id) => max($carry, (int) substr($id, strlen($prefix) + 1)),
                    0,
                );
            DB::table('order_number_sequences')->insert([
                'prefix' => $prefix,
                'next_number' => $max + 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }
    public function down(): void
    {
        Schema::dropIfExists('order_number_sequences');
    }
};
