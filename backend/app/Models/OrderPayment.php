<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class OrderPayment extends Model {
    protected $guarded = [];
    protected $casts = ['amount_usd_cents'=>'integer','exchange_rate_khr_per_usd'=>'integer','tendered_usd_cents'=>'integer','tendered_khr'=>'integer','change_usd_cents'=>'integer','change_khr'=>'integer','settlement_rounding_khr'=>'integer','metadata'=>'array','confirmed_at'=>'datetime'];
    public function order(){ return $this->belongsTo(Order::class); }
    public function confirmedBy(){ return $this->belongsTo(Employee::class,'confirmed_by_employee_id'); }
}
