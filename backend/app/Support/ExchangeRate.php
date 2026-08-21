<?php
namespace App\Support;
use App\Models\Setting;
final class ExchangeRate
{
    public static function current(): int
    {
        return (int) (Setting::find('pos_rules')?->value_json[
            'exchangeRateKhrPerUsd'
        ] ?? 4100);
    }
    public static function increment(): int
    {
        return max(
            1,
            (int) (Setting::find('pos_rules')?->value_json[
                'khrRoundingIncrement'
            ] ?? 100),
        );
    }
    public static function usdToKhr(
        int $cents,
        ?int $rate = null,
        ?int $increment = null,
    ): array {
        $rate ??= self::current();
        $increment ??= self::increment();
        $exact = $cents * $rate; // exact in cent-riel
        $rounded =
            intdiv($exact + intdiv($increment * 100, 2), $increment * 100) *
            $increment;
        return [
            'khr' => $rounded,
            'roundingKhr' => $rounded - intdiv($exact, 100),
            'rate' => $rate,
        ];
    }
    public static function khrToUsdNumerator(int $khr): int
    {
        return $khr * 100;
    }
}
