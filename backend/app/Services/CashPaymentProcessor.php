<?php
namespace App\Services;
use App\Contracts\PaymentProcessor;
use App\Models\{Employee, Order, OrderPayment};
final class CashPaymentProcessor implements PaymentProcessor
{
    public function __construct(private PaymentService $payments) {}
    public function validate(Order $order, array $input): void {}
    public function confirm(
        Order $order,
        array $input,
        Employee $employee,
    ): OrderPayment {
        return $this->payments->confirmCash($order, $input, $employee);
    }
    public function cancel(OrderPayment $payment): void
    {
        $payment->update(['status' => 'failed']);
    }
    public function serialize(OrderPayment $payment): array
    {
        return $payment->toArray();
    }
}
