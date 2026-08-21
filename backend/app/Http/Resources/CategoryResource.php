<?php
namespace App\Http\Resources;
use App\Models\Product;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
/** @mixin \App\Models\Category */
class CategoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $products = Product::where('category_id', $this->id);
        return [
            'id' => $this->id,
            'name' => $this->name,
            'items' => (clone $products)->count(),
            'active' => (clone $products)->where('active', true)->count(),
            'revenue' => Money::toDecimal(
                (int) (clone $products)->sum('revenue_cents'),
            ),
            'color' => $this->color,
            'sortOrder' => $this->sort_order,
        ];
    }
}
