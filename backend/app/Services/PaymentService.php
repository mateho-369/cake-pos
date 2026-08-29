<?php
namespace App\Services;
use App\Jobs\SendCustomerStatusNotification;
use App\Jobs\SendStaffOrderNotification;
use App\Models\{Employee, Order, OrderPayment, Product, OrderStatusEvent};
use App\Support\CashTender;
use App\Support\ExchangeRate;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
final class PaymentService
{
    public function __construct(private readonly AuditService $audit) {}

    public function confirmCash(
        Order $order,
        array $input,
        Employee $employee,
    ): OrderPayment {
        return $this->confirm($order, 'cash', $input, $employee);
    }
    public function confirmManualQr(
        Order $order,
        Employee $employee,
    ): OrderPayment {
        return DB::transaction(function () use ($order, $employee) {
            $order = Order::whereKey($order->id)
                ->lockForUpdate()
                ->firstOrFail();
            $existing = $order
                ->payments()
                ->where('status', 'confirmed')
                ->first();
            if ($existing) {
                return $existing;
            }
            $this->ensurePayable($order);
            $payment = OrderPayment::create([
                'order_id' => $order->id,
                'method' => 'qr_manual',
                'status' => 'confirmed',
                'amount_usd_cents' => $order->total_cents,
                'exchange_rate_khr_per_usd' => ExchangeRate::current(),
                'confirmed_by_employee_id' => $employee->id,
                'confirmed_at' => now(),
            ]);
            $this->settle($order, $payment);
            SendStaffOrderNotification::dispatch($order->id);
            return $payment;
        });
    }
    private function confirm(
        Order $order,
        string $method,
        array $input,
        Employee $employee,
    ): OrderPayment {
        return DB::transaction(function () use (
            $order,
            $method,
            $input,
            $employee,
        ) {
            $order = Order::whereKey($order->id)
                ->lockForUpdate()
                ->firstOrFail();
            $existing = $order
                ->payments()
                ->where('status', 'confirmed')
                ->first();
            if ($existing) {
                return $existing;
            }
            $this->ensurePayable($order);
            $tender = CashTender::validate($order->total_cents, $input);
            $payment = OrderPayment::create([
                'order_id' => $order->id,
                'method' => $method,
                'status' => 'confirmed',
                'amount_usd_cents' => $order->total_cents,
                'exchange_rate_khr_per_usd' => $tender['rate'],
                'tendered_usd_cents' => $tender['usd'],
                'tendered_khr' => $tender['khr'],
                'change_usd_cents' => $tender['changeUsd'],
                'change_khr' => $tender['changeKhr'],
                'settlement_rounding_khr' => $tender['roundingKhr'],
                'confirmed_by_employee_id' => $employee->id,
                'confirmed_at' => now(),
            ]);
            $this->settle($order, $payment);
            SendStaffOrderNotification::dispatch($order->id);
            return $payment;
        });
    }
    /**
     * Only an order that is still open (pending/confirmed/ready Telegram
     * order, or a parked hold) can take a payment. A REJECTED or discarded
     * order is Cancelled: its reserved stock is already back on the shelf,
     * so letting a stale terminal pay it would sell stock nobody reserved.
     * Already-paid orders never reach this check — the idempotent
     * existing-payment return above handles them.
     */
    private function ensurePayable(Order $order): void
    {
        $open = ['Pending', 'Confirmed', 'Ready', 'Held'];
        if (
            in_array($order->status, $open, true) &&
            $order->payment_status !== 'paid'
        ) {
            return;
        }
        throw new HttpResponseException(
            response()->json(
                [
                    'message' =>
                        "Order {$order->id} is {$order->status} — only open orders can be paid",
                ],
                409,
            ),
        );
    }

    private function settle(Order $order, OrderPayment $payment): void
    {
        $from = $order->status;
        $employee = $payment->confirmed_by_employee_id
            ? Employee::find($payment->confirmed_by_employee_id)
            : null;
        // Order-to-employee integrity: an order completed through the POS is
        // always attributed to the specific logged-in employee who took the
        // payment — including customer orders that started without a cashier.
        $claimed = false;
        if ($order->cashier_id === null && $employee) {
            $claimed = true;
        }
        $order->update([
            'status' => 'Completed',
            'payment_status' => 'paid',
            'fulfillment_status' => 'Completed',
            'payment' => $payment->method === 'cash' ? 'Cash' : 'KHQR',
            ...$claimed ? ['cashier_id' => $employee->id] : [],
        ]);
        OrderStatusEvent::create([
            'order_id' => $order->id,
            'from_status' => $from,
            'to_status' => 'Completed',
            'employee_id' => $payment->confirmed_by_employee_id,
        ]);
        $this->audit->log($employee, 'order.completed', $order->id, [
            'fromStatus' => $from,
            'totalCents' => $order->total_cents,
            'paymentMethod' => $payment->method,
            'claimedFromUnassigned' => $claimed,
        ]);
        if ($order->source === 'telegram') {
            SendCustomerStatusNotification::dispatch($order->id);
        }
        foreach (
            $order->orderItems()->with('product')->lockForUpdate()->get()
            as $item
        ) {
            if (!$item->product) {
                continue;
            }
            $p = Product::whereKey($item->product_id)
                ->lockForUpdate()
                ->firstOrFail();
            if ($p->stock < $item->quantity) {
                throw ValidationException::withMessages([
                    'stock' => ["{$p->name} does not have enough stock"],
                ]);
            }
            $p->decrement('stock', $item->quantity);
            if ($p->reserved_stock) {
                $p->decrement(
                    'reserved_stock',
                    min($p->reserved_stock, $item->quantity),
                );
            }
        }
    }
}
