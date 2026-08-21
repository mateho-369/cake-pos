<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class OrderStatusEvent extends Model
{
    protected $guarded = [];
    protected $casts = ['metadata' => 'array'];
    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
