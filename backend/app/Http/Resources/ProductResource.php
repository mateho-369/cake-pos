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
            // Admin override for the out-of-stock presentation. The "Out of
            // stock" state itself is purely derived from `stock` on the
            // client; this only says "hide entirely instead" when stock = 0.
            'hideWhenOutOfStock' => (bool) $this->hide_when_out_of_stock,
            // Exposed when the caller eager-loads the count (catalog index).
            // Lets the admin UI explain up-front why a product can't be
            // hard-deleted instead of waiting for the 422 from DELETE.
            'orderItemReferences' => $this->whenCounted(
                'orderItems',
                fn($count) => (int) $count,
            ),
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
