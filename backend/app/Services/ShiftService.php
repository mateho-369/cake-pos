<?php
namespace App\Services;
use App\Models\{Employee, Order, Shift};
use App\Support\Money;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
class ShiftService
{
    public function current(): ?Shift
    {
        return Shift::where('status', 'Open')
            ->with('employee')
            ->latest('id')
            ->first();
    }
    public function open(
        Employee $employee,
        mixed $openingCash,
        mixed $openingKhr = 0,
    ): Shift {
        return DB::transaction(function () use (
            $employee,
            $openingCash,
            $openingKhr,
        ) {
            DB::table('store_shift_locks')->insertOrIgnore([
                'id' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('store_shift_locks')
                ->where('id', 1)
                ->lockForUpdate()
                ->first();
            if ($this->current()) {
                $this->conflict('A store shift is already open');
            }
            $usd = Money::fromDecimal($openingCash, 'openingCash');
            $khr = (int) $openingKhr;
            if ($khr < 0) {
                $this->conflict('Opening KHR cannot be negative');
            }
            return Shift::create([
                'employee_id' => $employee->id,
                'opened_by_employee_id' => $employee->id,
                'opening_cash_cents' => $usd,
                'opening_cash_usd_cents' => $usd,
                'opening_cash_khr' => $khr,
                'opened_at' => now(),
                'status' => 'Open',
            ]);
        });
    }
    public function close(
        Employee $employee,
        mixed $closingCash,
        mixed $closingKhr = 0,
    ): array {
        return DB::transaction(function () use (
            $employee,
            $closingCash,
            $closingKhr,
        ) {
            DB::table('store_shift_locks')
                ->where('id', 1)
                ->lockForUpdate()
                ->first();
            $shift = Shift::where('status', 'Open')->lockForUpdate()->first();
            if (!$shift) {
                $this->conflict('No open shift found');
            }
            $policy =
                \App\Models\Setting::find('pos_rules')?->value_json[
                    'shiftClosingPolicy'
                ] ?? 'opener_or_admin';
            if ($employee->role !== 'admin' && $policy === 'admin_only') {
                $this->conflict('Only an administrator may close shifts');
            }
            if (
                $employee->role !== 'admin' &&
                $policy === 'opener_or_admin' &&
                $shift->opened_by_employee_id != $employee->id
            ) {
                $this->conflict(
                    'Only the shift opener or an administrator may close this shift',
                );
            }
            $usd = Money::fromDecimal($closingCash, 'closingCash');
            $khr = (int) $closingKhr;
            $sales = $this->cashSalesSince($shift);
            $expectedUsd = $shift->opening_cash_usd_cents + $sales[0];
            $expectedKhr = $shift->opening_cash_khr + $sales[1];
            $shift->update([
                'closing_cash_usd_cents' => $usd,
                'closing_cash_khr' => $khr,
                'expected_cash_usd_cents' => $expectedUsd,
                'expected_cash_khr' => $expectedKhr,
                'variance_usd_cents' => $usd - $expectedUsd,
                'variance_khr' => $khr - $expectedKhr,
                'closed_by_employee_id' => $employee->id,
                'closed_at' => now(),
                'status' => 'Closed',
            ]);
            return [$shift, $sales];
        });
    }
    /**
     * Real cash received (tendered minus change) for completed cash orders
     * recorded since the shift opened. Used while the shift is still open so
     * the admin can see the live expected drawer, and at close time.
     *
     * @return array{0:int,1:int} [usd cents, khr]
     */
    public function cashSalesSince(Shift $shift): array
    {
        return Order::where('status', 'Completed')
            ->where('payment', 'Cash')
            ->where('created_at', '>=', $shift->opened_at)
            ->with('payments')
            ->get()
            ->reduce(
                function ($a, $o) {
                    $p = $o->payments
                        ->where('method', 'cash')
                        ->where('status', 'confirmed')
                        ->first();
                    return [
                        $a[0] +
                        ($p?->tendered_usd_cents ?? $o->total_cents) -
                        ($p?->change_usd_cents ?? 0),
                        $a[1] +
                        ($p?->tendered_khr ?? 0) -
                        ($p?->change_khr ?? 0),
                    ];
                },
                [0, 0],
            );
    }
    private function conflict(string $message): never
    {
        throw new HttpResponseException(
            response()->json(['message' => $message], 409),
        );
    }
}
