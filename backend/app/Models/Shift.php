<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Shift extends Model
{
    public $timestamps = false;
    protected $guarded = [];
    protected $casts = [
        'opening_cash_cents' => 'integer',
        'closing_cash_cents' => 'integer',
        'expected_cash_cents' => 'integer',
        'variance_cents' => 'integer',
        'opened_at' => 'datetime',
        'closed_at' => 'datetime',
    ];
    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }
}
