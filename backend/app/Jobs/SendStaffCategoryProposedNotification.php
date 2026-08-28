<?php
namespace App\Jobs;
use App\Models\Category;
use App\Services\StaffNotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Tells the owner that a cashier proposed a category at the terminal. The
 * category is already active and usable — this is a review nudge, not a gate.
 */
class SendStaffCategoryProposedNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;
    public function __construct(
        public int $categoryId,
        public string $employeeName = '—',
    ) {}
    public function handle(StaffNotificationService $service): void
    {
        $category = Category::find($this->categoryId);
        if ($category) {
            $service->categoryProposed($category, $this->employeeName);
        }
    }
}
