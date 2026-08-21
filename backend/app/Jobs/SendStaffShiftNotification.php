<?php
namespace App\Jobs;
use App\Models\Shift;
use App\Services\StaffNotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Bus\Queueable;
class SendStaffShiftNotification implements ShouldQueue
{
    use Queueable;
    public function __construct(public int $shiftId, public array $sales) {}
    public function handle(StaffNotificationService $service): void
    {
        $shift = Shift::find($this->shiftId);
        if ($shift) {
            $service->shiftClosed($shift, $this->sales);
        }
    }
}
