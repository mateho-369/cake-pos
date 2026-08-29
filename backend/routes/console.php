<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/**
 * Production-only audit helper for the "possible duplicate order" reports
 * (e.g. two CS-* rows minutes/hours apart with the same items and total).
 *
 * It cannot infer intent — only surface rows that share the same
 * customer/cashier/total/detail signature so a human can compare
 * created_at, idempotency_key and source and decide whether they are a
 * real duplicate or two separate tests. Run on the VM:
 *
 *   docker compose exec -T app php artisan orders:duplicate-check
 *   docker compose exec -T app php artisan orders:duplicate-check --minutes=1440
 */
Artisan::command('orders:duplicate-check {--minutes=1440}', function (): void {
    $minutes = (int) $this->option('minutes');
    $since = now()->subMinutes($minutes);

    $groups = DB::table('orders as o')
        ->where('o.created_at', '>=', $since)
        ->whereNull('o.parent_order_id')
        ->whereIn('o.status', ['Pending', 'Held', 'Completed', 'Paid'])
        ->selectRaw(
            "o.customer_id,
             o.cashier_id,
             o.source,
             o.total_cents,
             o.detail_json,
             COUNT(*) hits,
             MAX(o.created_at) latest_created_at,
             MIN(o.created_at) earliest_created_at,
             GROUP_CONCAT(DISTINCT o.id ORDER BY o.created_at SEPARATOR ', ') order_ids,
             GROUP_CONCAT(DISTINCT COALESCE(NULLIF(o.idempotency_key, ''), '-') ORDER BY o.created_at SEPARATOR ', ') idempotency_keys",
        )
        ->groupBy(
            'o.customer_id',
            'o.cashier_id',
            'o.source',
            'o.total_cents',
            'o.detail_json',
        )
        ->havingRaw('COUNT(*) > 1')
        ->orderByDesc('latest_created_at')
        ->get();

    if ($groups->isEmpty()) {
        $this->info(
            "No duplicate-signature orders found in the last {$minutes} minute(s).",
        );
        $this->line(
            'This only checks signatures; it does not prove the two rows were one physical sale.',
        );
        return;
    }

    $this->warn(
        "Found {$groups->count()} group(s) with identical order signatures (last {$minutes} minutes):",
    );
    foreach ($groups as $group) {
        $this->line('');
        $this->line("  IDs: {$group->order_ids}");
        $this->line(
            sprintf(
                '  Source: %s | Customer: %s | Cashier: %s | Total: %d cents',
                $group->source,
                $group->customer_id ?? '-',
                $group->cashier_id ?? '-',
                (int) $group->total_cents,
            ),
        );
        $this->line("  Detail: {$group->detail_json}");
        $this->line("  Idempotency keys: {$group->idempotency_keys}");
        $this->line(
            "  Created: {$group->earliest_created_at} -> {$group->latest_created_at} (hits: {$group->hits})",
        );
        $this->line(
            '  Check the actual rows and origin before treating this as a duplicate.',
        );
    }
})->purpose('Audit orders that share a duplicate-looking signature');
