<?php
namespace App\Support;

use Illuminate\Validation\ValidationException;

final class Money
{
    public static function fromDecimal(
        mixed $value,
        string $field = 'amount',
    ): int {
        $raw = trim((string) $value);
        if (!preg_match('/^\d+(?:\.\d{1,2})?$/', $raw)) {
            throw ValidationException::withMessages([
                $field => ["$field must have at most two decimal places"],
            ]);
        }
        [$whole, $fraction] = array_pad(explode('.', $raw, 2), 2, '');
        $fraction = str_pad($fraction, 2, '0');
        if (strlen($whole) > 15) {
            throw ValidationException::withMessages([
                $field => ["$field is too large"],
            ]);
        }
        return (int) $whole * 100 + (int) $fraction;
    }
    public static function toDecimal(?int $cents): ?float
    {
        return $cents === null ? null : $cents / 100;
    }
    public static function percentToBasisPoints(mixed $value): int
    {
        $raw = trim((string) $value);
        if (!preg_match('/^\d+(?:\.\d{1,2})?$/', $raw)) {
            throw ValidationException::withMessages([
                'discount.amount' => [
                    'Percentage must have at most two decimal places',
                ],
            ]);
        }
        [$whole, $fraction] = array_pad(explode('.', $raw, 2), 2, '');
        $bps = (int) $whole * 100 + (int) str_pad($fraction, 2, '0');
        if ($bps > 10000) {
            throw ValidationException::withMessages([
                'discount.amount' => ['Percentage cannot exceed 100'],
            ]);
        }
        return $bps;
    }
    public static function discountCents(
        int $subtotal,
        string $type,
        int $value,
    ): int {
        $discount =
            $type === 'percentage'
                ? intdiv($subtotal * $value + 5000, 10000)
                : $value;
        return min($subtotal, max(0, $discount));
    }
}
