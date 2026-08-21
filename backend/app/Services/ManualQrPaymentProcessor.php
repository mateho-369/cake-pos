<?php
namespace App\Services;
use App\Contracts\PaymentProcessor;
use App\Models\{Employee,Order,OrderPayment};
/** Manual confirmation only. Future bank processors must verify with their provider. */
final class ManualQrPaymentProcessor implements PaymentProcessor { public function __construct(private PaymentService $payments){} public function validate(Order $order,array $input):void { if(empty($input['confirmed'])) abort(422,'Cashier confirmation is required'); } public function confirm(Order $order,array $input,Employee $employee):OrderPayment{$this->validate($order,$input);return $this->payments->confirmManualQr($order,$employee);} public function cancel(OrderPayment $payment):void{$payment->update(['status'=>'failed']);} public function serialize(OrderPayment $payment):array{return $payment->toArray();} }
