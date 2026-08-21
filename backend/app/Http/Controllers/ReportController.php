<?php

namespace App\Http\Controllers;

use App\Models\{Order, Product};
use App\Support\Money;
use Illuminate\Http\JsonResponse;

class ReportController extends Controller
{
    public function report(): JsonResponse
    {
        $sales = Order::whereDate('created_at', today())
            ->selectRaw(
                "coalesce(sum(case when status in ('Completed','Refunded','Voided') then total_cents else 0 end),0) total,sum(status = 'Completed') count",
            )
            ->first();
        $revenueByDay = collect(range(6, 0))->map(function ($daysAgo) {
            $date = now()->subDays($daysAgo);
            return [
                'day' => $date->format('D'),
                'value' => Money::toDecimal(
                    (int) Order::whereIn('status', [
                        'Completed',
                        'Refunded',
                        'Voided',
                    ])
                        ->whereDate('created_at', $date)
                        ->sum('total_cents'),
                ),
            ];
        });
        $topProducts = Product::with('category')
            ->orderByDesc('sold')
            ->orderByDesc('revenue_cents')
            ->limit(5)
            ->get()
            ->map(
                fn($product) => [
                    'id' => $product->id,
                    'name' => $product->name,
                    'category' => $product->category->name,
                    'units' => (int) $product->sold,
                    'revenue' => Money::toDecimal($product->revenue_cents),
                ],
            );
        return response()->json([
            'todaySalesTotal' => Money::toDecimal((int) $sales->total),
            'todayOrdersCount' => (int) $sales->count,
            'revenueData' => $revenueByDay,
            'topProducts' => $topProducts,
        ]);
    }
}
