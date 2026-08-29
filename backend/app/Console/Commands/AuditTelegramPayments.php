<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Finds the legacy data-created hole: Telegram orders completed through the
 * old manual "Order status" dropdown. Those orders were stamped
 * Paid/Ready/Completed with `payment = KHQR` but never created an
 * `order_payments` row, so they are invisible to cash reports and shift
 * reconciliation.
 *
 * This is deliberately a REPORT, not a backfill — the owner must supply the
 * real method/tender for each sale before anything is inserted.
 */
class AuditTelegramPayments extends Command
{
    protected $signature = 'audit:telegram-payments {--list : print each affected order}';

    protected $description = 'Find Completed/Paid Telegram orders with no confirmed OrderPayment (missing from reports).';

    public function handle(): int
    {
        $rows = DB::table('orders')
            ->leftJoin('order_payments', 'order_payments.order_id', '=', 'orders.id')
            ->where('orders.source', 'telegram')
            ->whereIn('orders.status', ['Completed', 'Paid'])
            ->whereNull('order_payments.id')
            ->select([
                'orders.id',
                'orders.status',
                'orders.total_cents',
                'orders.created_at',
                'orders.payment',
            ])
            ->orderBy('orders.created_at')
            ->get();

        if ($rows->isEmpty()) {
            $this->info(
                'No Completed/Paid Telegram orders missing a payment record.',
            );

            return self::SUCCESS;
        }

        $totalCents = (int) $rows->sum('total_cents');
        $this->warn(
            'Found '.$rows->count()
            .' Completed/Paid Telegram order(s) with no OrderPayment row.',
        );
        $this->info('Total missing value: $'.number_format($totalCents / 100, 2));
        $this->line(
            'These sales are missing from cash/QR reporting and shift reconciliation.',
        );
        $this->warn(
            'Do NOT backfill automatically. A real method + tender must come '
            .'from the owner\'s own record of each sale.',
        );

        $this->warn(
            'Completed rows are report-only: the old dropdown already '
            .'decremented stock/counted revenue for them, so re-paying one '
            .'through /pay would double-sell.',
        );

        if ($this->option('list')) {
            $table = $rows->map(
                fn($row) => [
                    $row->id,
                    $row->status,
                    $row->payment,
                    number_format($row->total_cents / 100, 2),
                    $row->created_at,
                ],
            );
            $this->table(
                ['Order', 'Status', 'Stored method', 'Total (USD)', 'Created'],
                $table,
            );
        }

        return self::FAILURE; // non-zero so CI owners notice the audit result
    }
}
