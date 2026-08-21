<?php
namespace App\Services;
use App\Models\{Employee,Order,OrderPayment,Product,OrderStatusEvent};
use App\Support\ExchangeRate;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
final class PaymentService {
    public function confirmCash(Order $order, array $input, Employee $employee): OrderPayment {
        return $this->confirm($order, 'cash', $input, $employee);
    }
    public function confirmManualQr(Order $order, Employee $employee): OrderPayment {
        return DB::transaction(function() use ($order,$employee) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $existing = $order->payments()->where('status','confirmed')->first();
            if ($existing) return $existing;
            $payment = OrderPayment::create(['order_id'=>$order->id,'method'=>'qr_manual','status'=>'confirmed','amount_usd_cents'=>$order->total_cents,'exchange_rate_khr_per_usd'=>ExchangeRate::current(),'confirmed_by_employee_id'=>$employee->id,'confirmed_at'=>now()]);
            $this->settle($order, $payment);
            return $payment;
        });
    }
    private function confirm(Order $order,string $method,array $input,Employee $employee): OrderPayment {
        return DB::transaction(function() use($order,$method,$input,$employee) {
            $order=Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $existing=$order->payments()->where('status','confirmed')->first(); if($existing) return $existing;
            $rate=ExchangeRate::current();
            if(isset($input['exchangeRateKhrPerUsd']) && (int)$input['exchangeRateKhrPerUsd'] !== $rate) throw ValidationException::withMessages(['exchangeRateKhrPerUsd'=>['Exchange rate is stale']]);
            $usd=(int)($input['usdReceivedCents'] ?? 0); $khr=(int)($input['khrReceived'] ?? 0); $cu=(int)($input['changeUsdCents'] ?? 0); $ck=(int)($input['changeKhr'] ?? 0);
            if(min($usd,$khr,$cu,$ck)<0) throw ValidationException::withMessages(['payment'=>['Tender and change cannot be negative']]);
            $due=$order->total_cents*$rate; $tender=$usd*$rate+$khr*100; $change=$cu*$rate+$ck*100;
            if($tender<$due) throw ValidationException::withMessages(['payment'=>['Tender is below the amount due']]);
            $expected=$tender-$due; $difference=$change-$expected; $tolerance=ExchangeRate::increment()*100;
            if(abs($difference)>$tolerance) throw ValidationException::withMessages(['payment'=>['Change breakdown does not match the expected change']]);
            $payment=OrderPayment::create(['order_id'=>$order->id,'method'=>$method,'status'=>'confirmed','amount_usd_cents'=>$order->total_cents,'exchange_rate_khr_per_usd'=>$rate,'tendered_usd_cents'=>$usd,'tendered_khr'=>$khr,'change_usd_cents'=>$cu,'change_khr'=>$ck,'settlement_rounding_khr'=>intdiv($difference,100),'confirmed_by_employee_id'=>$employee->id,'confirmed_at'=>now()]);
            $this->settle($order,$payment); return $payment;
        });
    }
    private function settle(Order $order,OrderPayment $payment): void {
        $from=$order->status; $order->update(['status'=>'Completed','payment_status'=>'paid','fulfillment_status'=>'Completed','payment'=>$payment->method==='cash'?'Cash':'KHQR']); OrderStatusEvent::create(['order_id'=>$order->id,'from_status'=>$from,'to_status'=>'Completed','employee_id'=>$payment->confirmed_by_employee_id]);
        foreach($order->orderItems()->with('product')->lockForUpdate()->get() as $item) { if(!$item->product) continue; $p=Product::whereKey($item->product_id)->lockForUpdate()->firstOrFail(); if($p->stock<$item->quantity) throw ValidationException::withMessages(['stock'=>["{$p->name} does not have enough stock"]]); $p->decrement('stock',$item->quantity); if($p->reserved_stock) $p->decrement('reserved_stock',min($p->reserved_stock,$item->quantity)); }
    }
}
