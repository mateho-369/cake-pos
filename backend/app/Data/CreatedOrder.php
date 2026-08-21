<?php

namespace App\Data;

use App\Models\Order;

final readonly class CreatedOrder
{
    public function __construct(public Order $order, public bool $wasCreated) {}
}
