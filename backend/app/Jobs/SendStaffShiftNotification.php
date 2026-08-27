<?php
namespace App\Jobs;
use App\Models\Shift;
use App\Services\StaffNotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Bus\Queueable;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
class SendStaffShiftNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;
    public function __construct(public int $shiftId, public array $sales) {}
    public function handle(StaffNotificationService $service): void
    {
        $shift = Shift::find($this->shiftId);
        if ($shift) {
            $service->shiftClosed($shift, $this->sales);
        }
    }
}
