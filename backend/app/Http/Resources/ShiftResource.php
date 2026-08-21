<?php
namespace App\Http\Resources;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
/** @mixin \App\Models\Shift */
class ShiftResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employeeId' => $this->employee_id,
            'openingCash' => Money::toDecimal($this->opening_cash_cents),
            'closingCash' => Money::toDecimal($this->closing_cash_cents),
            'expectedCash' => Money::toDecimal($this->expected_cash_cents),
            'variance' => Money::toDecimal($this->variance_cents),
            'openedAt' => $this->opened_at->toISOString(),
            'closedAt' => $this->closed_at?->toISOString(),
            'status' => $this->status,
            'openingCashUsdCents' => $this->opening_cash_usd_cents,
            'openingCashKhr' => $this->opening_cash_khr,
            'expectedCashUsdCents' => $this->expected_cash_usd_cents,
            'expectedCashKhr' => $this->expected_cash_khr,
            'closingCashUsdCents' => $this->closing_cash_usd_cents,
            'closingCashKhr' => $this->closing_cash_khr,
            'varianceUsdCents' => $this->variance_usd_cents,
            'varianceKhr' => $this->variance_khr,
            'openedByEmployeeId' => $this->opened_by_employee_id,
            'closedByEmployeeId' => $this->closed_by_employee_id,
            'openedBy' => $this->employee?->name,
        ];
    }
}
