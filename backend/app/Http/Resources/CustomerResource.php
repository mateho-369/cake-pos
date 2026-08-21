<?php
namespace App\Http\Resources;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
/** @mixin \App\Models\Customer */
class CustomerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'telegramUserId' => $this->telegram_user_id,
            'name' => $this->name,
            'phone' => $this->phone,
            'telegramUsername' => $this->telegram_username,
            'firstSeenAt' => $this->first_seen_at->toISOString(),
            'totalOrders' => $this->orders_count,
            'totalSpent' => Money::toDecimal((int) ($this->total_spent ?? 0)),
        ];
    }
}
