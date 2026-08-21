<?php
namespace App\Contracts;
use App\Models\{Employee,Order,OrderPayment};
interface PaymentProcessor { public function validate(Order $order,array $input):void; public function confirm(Order $order,array $input,Employee $employee):OrderPayment; public function cancel(OrderPayment $payment):void; public function serialize(OrderPayment $payment):array; }
