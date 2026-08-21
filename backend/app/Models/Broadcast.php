<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Broadcast extends Model
{
    protected $guarded = [];
    protected $casts = ['sent_at' => 'datetime'];
    public function getCaptionAttribute($value)
    {
        return $value ?? $this->message;
    }
    public function createdBy()
    {
        return $this->belongsTo(Employee::class, 'created_by_employee_id');
    }
}
