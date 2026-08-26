<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Backfill: before OrderService started stamping payment_status='paid' on
 * walk-in orders, every completed order created through POST /api/orders was
 * left with the default 'unpaid' value even though a confirmed
 * order_payments row existed. Reporting queries filter on payment_status, so
 * those historical orders never appeared in any sales figure. This one-time
 * migration marks them paid so existing stores see real history.
 */
return new class extends Migration {
    public function up(): void
    {
        DB::statement(
            "UPDATE orders
             SET payment_status = 'paid',
                 fulfillment_status = COALESCE(fulfillment_status, 'Completed')
             WHERE status = 'Completed'
               AND payment_status = 'unpaid'
               AND EXISTS (
                   SELECT 1 FROM order_payments
                   WHERE order_payments.order_id = orders.id
                     AND order_payments.status = 'confirmed'
               )",
        );
    }

    public function down(): void
    {
        // Intentionally a no-op: the corrected payment status is the source of
        // truth and matches the confirmed payment records.
    }
};
