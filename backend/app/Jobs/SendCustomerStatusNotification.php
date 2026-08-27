<?php
namespace App\Jobs;
use App\Models\Order;
use App\Services\CustomerNotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Bus\Queueable;
class SendCustomerStatusNotification implements ShouldQueue
{
    use Queueable;
    public function __construct(public string $orderId) {}
    public function handle(CustomerNotificationService $service): void
    {
        $order = Order::find($this->orderId);
        if ($order) {
            $service->notifyStatus($order);
        }
    }
}
