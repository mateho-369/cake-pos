<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Employee extends Authenticatable
{
    use HasApiTokens, HasFactory;
    public $timestamps = false;
    protected $fillable = [
        'name',
        'email',
        'role',
        'password_hash',
        'pin_hash',
        'active',
        'created_at',
    ];
    protected $hidden = ['password_hash', 'pin_hash'];
    protected $casts = ['active' => 'boolean', 'created_at' => 'datetime'];
    public function getAuthPassword()
    {
        return $this->password_hash;
    }
    public function shifts()
    {
        return $this->hasMany(Shift::class);
    }
    public function orders()
    {
        return $this->hasMany(Order::class, 'cashier_id');
    }
}
