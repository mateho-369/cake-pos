<?php
namespace App\Services;
use Illuminate\Support\Facades\DB;

/**
 * Atomically issues the next number for an order-id prefix (CS/RF/TG/...).
 * Replaces a MAX(id)+1 scan of the whole orders table: two concurrent order
 * creations could both compute the same "next" number before either
 * inserted, so the loser's insert failed on the orders table's own unique
 * constraint with an uncaught 500 instead of a clean response. Row-locking
 * a dedicated counter (the same pattern already used for the store's
 * single-shift lock) makes issuing a number and incrementing it one atomic
 * step, so two requests can never receive the same value.
 *
 * Callers already wrap order creation in their own DB::transaction(); since
 * Laravel nests transactions as savepoints on the same connection, this
 * method's own transaction() isn't independent when called from inside one
 * of those — the lock is held, and the increment only becomes final, for
 * as long as that outer transaction runs. That's correct (still no two
 * callers can ever get the same number) and simplest; it does mean two
 * order creations sharing a prefix serialize against each other for the
 * length of the transaction, not just the moment the number is assigned.
 * Like a real auto-increment column, a number issued to a transaction that
 * later fails or rolls back is simply never reused — a gap, not a bug.
 */
final class OrderNumberSequence
{
    public function next(string $prefix): int
    {
        return DB::transaction(function () use ($prefix) {
            DB::table('order_number_sequences')->insertOrIgnore([
                'prefix' => $prefix,
                'next_number' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $number = (int) DB::table('order_number_sequences')
                ->where('prefix', $prefix)
                ->lockForUpdate()
                ->value('next_number');
            DB::table('order_number_sequences')
                ->where('prefix', $prefix)
                ->update([
                    'next_number' => $number + 1,
                    'updated_at' => now(),
                ]);
            return $number;
        });
    }
}
