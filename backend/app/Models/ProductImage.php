<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class ProductImage extends Model
{
    protected $guarded = [];
    protected $casts = [
        'sort_order' => 'integer',
    ];
    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}
