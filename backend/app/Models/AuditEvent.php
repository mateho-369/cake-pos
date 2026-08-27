<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class AuditEvent extends Model
{
    public const UPDATED_AT = null;
    protected $guarded = [];
    protected $casts = [
        'details_json' => 'array',
        'created_at' => 'datetime',
    ];
    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }
}
