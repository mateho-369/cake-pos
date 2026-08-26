<?php
namespace App\Services;
use App\Models\Employee;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
class WasteService
{
    /**
     * Record a real waste event: reduces sellable stock and appends an
     * immutable audit row used by the freshness & waste report.
     */
    public function record(Employee $employee, array $input): array
    {
        $productId = (int) $input['productId'];
        $quantity = (int) $input['quantity'];
        $reason = (string) $input['reason'];
        if ($quantity < 1) {
            throw ValidationException::withMessages([
                'quantity' => ['quantity must be at least 1'],
            ]);
        }
        return DB::transaction(function () use (
            $employee,
            $productId,
            $quantity,
            $reason,
            $input,
        ) {
            $product = Product::whereKey($productId)->lockForUpdate()->first();
            if (!$product) {
                throw ValidationException::withMessages([
                    'productId' => ['product not found'],
                ]);
            }
            if ((int) $product->stock < $quantity) {
                throw ValidationException::withMessages([
                    'quantity' => [
                        'only ' . (int) $product->stock . ' units on hand',
                    ],
                ]);
            }
            $unitPrice = (int) $product->price_cents;
            $product->update(['stock' => (int) $product->stock - $quantity]);
            $id = DB::table('inventory_waste_events')->insertGetId([
                'product_id' => $product->id,
                'product_name_snapshot' => $product->name,
                'category_snapshot' => $product->category?->name,
                'quantity' => $quantity,
                'unit_cost_cents' => null,
                'retail_value_cents' => $unitPrice * $quantity,
                'reason' => $reason,
                'note' => trim((string) ($input['note'] ?? '')) ?: null,
                'best_before' => $product->best_before?->format('Y-m-d'),
                'recorded_by_employee_id' => $employee->id,
                'recorded_at' => now(),
                'source' => 'admin',
                'idempotency_key' => (string) Str::uuid(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            return [
                'id' => $id,
                'productName' => $product->name,
                'quantity' => $quantity,
                'reason' => $reason,
                'retailValue' => ($unitPrice * $quantity) / 100,
                'remainingStock' => (int) $product->stock,
            ];
        });
    }
}
