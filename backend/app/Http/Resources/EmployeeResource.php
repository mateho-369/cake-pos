<?php
namespace App\Http\Resources;
use App\Models\{Order, Shift};
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
/** @mixin \App\Models\Employee */
class EmployeeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $shift = Shift::where('employee_id', $this->id)->latest('id')->first();
        $sales = Order::where('cashier_id', $this->id)
            ->where('status', 'Completed')
            ->whereDate('created_at', today())
            ->selectRaw('count(*) orders, coalesce(sum(total_cents),0) sales')
            ->first();
        return [
            'id' => $this->id,
            'name' => $this->name,
            'initials' => collect(explode(' ', $this->name))
                ->take(2)
                ->map(fn($part) => $part[0])
                ->join(''),
            'email' => $this->email,
            'role' => $this->role === 'admin' ? 'Owner · Admin' : 'Cashier',
            'status' => $this->active
                ? ($shift?->status === 'Open'
                    ? 'On shift'
                    : 'Active')
                : 'Inactive',
            'shift' => $shift
                ? $shift->opened_at->format('g:i A') .
                    ' – ' .
                    ($shift->closed_at?->format('g:i A') ?? 'now')
                : 'No shift recorded',
            'sales' => Money::toDecimal((int) ($sales->sales ?? 0)),
            'orders' => (int) ($sales->orders ?? 0),
        ];
    }
}
