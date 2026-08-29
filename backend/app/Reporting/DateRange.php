<?php
namespace App\Reporting;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;
final readonly class DateRange
{
    public function __construct(
        public CarbonImmutable $from,
        public CarbonImmutable $to,
    ) {}
    public static function from(array $input): self
    {
        $tz = $input['timezone'] ?? 'Asia/Phnom_Penh';
        $today = CarbonImmutable::now($tz)->startOfDay();
        $preset = $input['preset'] ?? 'today';
        if (empty($input['from'])) {
            $from = match ($preset) {
                'yesterday' => $today->subDay(),
                'this_week' => $today->startOfWeek(),
                'this_month' => $today->startOfMonth(),
                'last_month' => $today->subMonthNoOverflow()->startOfMonth(),
                'this_year' => $today->startOfYear(),
                default => $today,
            };
            $to = match ($preset) {
                'yesterday' => $today->subDay()->endOfDay(),
                'this_week' => $today->endOfWeek(),
                'this_month' => $today->endOfMonth(),
                'last_month' => $today->subMonthNoOverflow()->endOfMonth(),
                'this_year' => $today->endOfYear(),
                default => $today->endOfDay(),
            };
        } else {
            $from = CarbonImmutable::createFromFormat(
                'Y-m-d',
                $input['from'],
                $tz,
            )->startOfDay();
            $to = CarbonImmutable::createFromFormat(
                'Y-m-d',
                $input['to'] ?? $input['from'],
                $tz,
            )->endOfDay();
        }
        if ($from > $to) {
            throw ValidationException::withMessages([
                'from' => ['The start date must not be after the end date'],
            ]);
        }
        if ($from->diffInDays($to) > 366) {
            throw ValidationException::withMessages([
                'to' => ['Report range cannot exceed one year'],
            ]);
        }
        return new self($from->utc(), $to->utc());
    }
    public function previous(): self
    {
        $days = $this->from->diffInDays($this->to) + 1;
        return new self($this->from->subDays($days), $this->from->subSecond());
    }
}
