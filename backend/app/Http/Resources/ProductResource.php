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
            'images' => $this->resolveImages(),
            'active' => (bool) $this->active,
        ];
    }

    private function resolveImages(): array
    {
        $images = $this->relationLoaded('images') ? $this->images : collect();

        $gallery = $images
            ->map(
                fn($image) => [
                    'id' => $image->id,
                    'url' => $image->url,
                    'caption' => $image->caption,
                    'sortOrder' => $image->sort_order,
                ],
            )
            ->values();

        // Keep the legacy single-field behaviour working for any product that
        // predates the gallery feature (and for the quick-add flow).
        if ($gallery->isEmpty() && $this->image_url) {
            $gallery = collect([
                [
                    'id' => null,
                    'url' => $this->image_url,
                    'caption' => '',
                    'sortOrder' => 0,
                ],
            ]);
        }

        return $gallery->all();
    }

    private function freshnessStatus(): string
    {
        return $this->resource->freshnessStatus();
    }
}
