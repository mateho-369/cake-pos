<?php
namespace App\Services;
use App\Models\{AuditEvent, Employee};
use Illuminate\Http\Request;

/**
 * Append-only employee-accountability trail. Every money-sensitive action
 * (discounts, voids, refunds, price overrides, cancellations, held-order
 * conversions, shift open/close) is recorded with the acting employee, the
 * before/after values, and a timestamp. Entries are never updated or
 * deleted by the application.
 */
final class AuditService
{
    public function __construct(private readonly Request $request) {}

    public function log(
        ?Employee $employee,
        string $action,
        ?string $orderId = null,
        array $details = [],
    ): AuditEvent {
        return AuditEvent::create([
            'employee_id' => $employee?->id,
            'employee_name_snapshot' => $employee?->name ?? 'System',
            'action' => $action,
            'order_id' => $orderId,
            'details_json' => $details ?: null,
            'ip' => $this->request->ip(),
            'created_at' => now(),
        ]);
    }
}
