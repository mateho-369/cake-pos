<?php
namespace App\Services;
use App\Models\{Employee, Order, Shift};
use App\Support\Money;
use Illuminate\Http\Exceptions\HttpResponseException;
class ShiftService
{
    public function open(Employee $employee, mixed $openingCash): Shift
    {
        $cents = Money::fromDecimal($openingCash, 'openingCash');
        if (
            Shift::where('employee_id', $employee->id)
                ->where('status', 'Open')
                ->exists()
        ) {
            $this->conflict('This employee already has an open shift');
        }
        return Shift::create([
            'employee_id' => $employee->id,
            'opening_cash_cents' => $cents,
            'opened_at' => now(),
            'status' => 'Open',
        ]);
    }
    public function close(Employee $employee, mixed $closingCash): array
    {
        $closing = Money::fromDecimal($closingCash, 'closingCash');
        $shift = Shift::where('employee_id', $employee->id)
            ->where('status', 'Open')
            ->latest('id')
            ->first();
        if (!$shift) {
            $this->conflict('No open shift found');
        }
        $sales = (int) Order::where('cashier_id', $employee->id)
            ->where('payment', 'Cash')
            ->where('status', 'Completed')
            ->where('created_at', '>=', $shift->opened_at)
            ->sum('total_cents');
        $expected = $shift->opening_cash_cents + $sales;
        $shift->update([
            'closing_cash_cents' => $closing,
            'expected_cash_cents' => $expected,
            'variance_cents' => $closing - $expected,
            'closed_at' => now(),
            'status' => 'Closed',
        ]);
        return [$shift, $sales];
    }
    private function conflict(string $message): never
    {
        throw new HttpResponseException(
            response()->json(['message' => $message], 409),
        );
    }
}
