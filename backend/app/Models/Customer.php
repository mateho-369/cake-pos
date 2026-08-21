<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Customer extends Model
{
    public $timestamps = false;
    protected $guarded = [];
    protected $casts = [
        'first_seen_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
    public function orders()
    {
        return $this->hasMany(Order::class);
    }
}
