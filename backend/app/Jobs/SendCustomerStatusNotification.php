<?php
namespace App\Jobs;
use App\Models\Order;
use App\Services\CustomerNotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Bus\Queueable;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
class SendCustomerStatusNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;
    public function __construct(public string $orderId) {}
    public function handle(CustomerNotificationService $service): void
    {
        $order = Order::find($this->orderId);
        if ($order) {
            $service->notifyStatus($order);
        }
    }
}
