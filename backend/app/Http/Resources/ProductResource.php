<?php

namespace App\Http\Resources;

use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Product */
class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'category' => $this->category->name,
            'price' => Money::toDecimal($this->price_cents),
            'stock' => (int) $this->stock,
            'sold' => (int) $this->sold,
            'revenue' => Money::toDecimal($this->revenue_cents),
            'status' => $this->freshnessStatus(),
            'madeAt' => $this->made_at?->format('M j, Y'),
            'bestBefore' =>
                $this->best_before?->format('M j, Y') ?? 'Made to order',
            'imagePosition' => $this->image_position,
            'imageUrl' => $this->image_url,
            'active' => (bool) $this->active,
        ];
    }

    private function freshnessStatus(): string
    {
        if (!$this->best_before) {
            return 'Fresh';
        }

        $daysUntilExpiry = (int) now()
            ->startOfDay()
            ->diffInDays($this->best_before, false);

        return match ($daysUntilExpiry) {
            0 => 'Expires today',
            1 => '1 day left',
            default => $this->best_before->isPast() ? 'Expired' : 'Fresh',
        };
    }
}
