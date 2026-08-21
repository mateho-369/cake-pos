<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Product extends Model
{
    protected $guarded = [];
    protected $casts = [
        'price_cents' => 'integer',
        'stock' => 'integer',
        'sold' => 'integer',
        'revenue_cents' => 'integer',
        'active' => 'boolean',
        'made_at' => 'date:Y-m-d',
        'best_before' => 'date:Y-m-d',
    ];
    public function category()
    {
        return $this->belongsTo(Category::class);
    }
}
