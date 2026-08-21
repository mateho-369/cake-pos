<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Order extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';
    protected $guarded = [];
    protected $casts = [
        'subtotal_cents' => 'integer',
        'discount_value' => 'integer',
        'discount_amount_cents' => 'integer',
        'total_cents' => 'integer',
        'items' => 'integer',
        'detail_json' => 'array',
    ];
    public function cashier()
    {
        return $this->belongsTo(Employee::class, 'cashier_id');
    }
    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }
    public function orderItems()
    {
        return $this->hasMany(OrderItem::class);
    }
    public function parentOrder()
    {
        return $this->belongsTo(self::class, 'parent_order_id');
    }
    public function corrections()
    {
        return $this->hasMany(self::class, 'parent_order_id');
    }
    public function payments() { return $this->hasMany(OrderPayment::class); }
    public function statusEvents() { return $this->hasMany(OrderStatusEvent::class); }
}
