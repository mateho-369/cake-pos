<?php

namespace App\Http\Resources;

use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Order */
class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $this->resource->loadMissing(['cashier', 'customer']);

        return [
            'id' => $this->id,
            'time' => $this->time,
            'date' => $this->date,
            'createdAt' => $this->created_at->toISOString(),
            'cashier' =>
                $this->cashier?->name ??
                ($this->customer ? 'Customer order' : 'Unknown'),
            'customer' => $this->customer
                ? [
                    'name' => $this->customer->name,
                    'phone' => $this->customer->phone,
                    'telegram_username' => $this->customer->telegram_username,
                ]
                : null,
            'customerId' => $this->customer_id,
            'source' => $this->source,
            'items' => (int) $this->items,
            'subtotal' => Money::toDecimal($this->subtotal_cents),
            'discountType' => $this->discount_type,
            'discountValue' => $this->discountValueForApi(),
            'discountAmount' => Money::toDecimal($this->discount_amount_cents),
            'total' => Money::toDecimal($this->total_cents),
            'payment' => $this->payment,
            'status' => $this->status,
            'detail' => $this->detail_json,
            'originalOrderId' => $this->parent_order_id,
        ];
    }

    private function discountValueForApi(): ?float
    {
        if ($this->discount_value === null) {
            return null;
        }

        return $this->discount_type === 'percentage'
            ? $this->discount_value / 100
            : Money::toDecimal($this->discount_value);
    }
}
