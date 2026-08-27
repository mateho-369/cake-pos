<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Product extends Model
{
    protected $guarded = [];
    protected $casts = [
        'price_cents' => 'integer',
        'stock' => 'integer',
        'reserved_stock' => 'integer',
        'sold' => 'integer',
        'revenue_cents' => 'integer',
        'active' => 'boolean',
        'hide_when_out_of_stock' => 'boolean',
        'made_at' => 'date:Y-m-d',
        'best_before' => 'date:Y-m-d',
    ];
    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function images()
    {
        return $this->hasMany(ProductImage::class)->orderBy('sort_order');
    }

    public function orderItems()
    {
        return $this->hasMany(OrderItem::class);
    }

    /**
     * Single source of truth for how a product appears in the freshness
     * pipeline. Used by the API resource (catalog, dashboard, sale terminal)
     * and by the freshness/waste report so every screen agrees on the counts.
     */
    public function freshnessStatus(): string
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
