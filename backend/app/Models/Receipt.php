<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Receipt extends Model
{
    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = 'order_id';
    protected $keyType = 'string';
    protected $guarded = [];
    protected $casts = ['snapshot_json' => 'array', 'created_at' => 'datetime'];
}
