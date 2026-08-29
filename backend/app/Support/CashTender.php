<?php
namespace App\Support;

use Illuminate\Validation\ValidationException;

/**
 * Mixed-currency cash tender (USD notes + riel notes) for a single sale.
 * Integer math lives here so walk-in checkout and delayed /pay cannot drift.
 *
 * Units: USD is cents; KHR is whole riel. Internally everything is
 * cent-riel (1 USD cent = $rate cent-riel; 1 riel = 100 cent-riel).
 */
final class CashTender
{
    /**
     * @param  array<string,mixed>  $input
     * @return array{
     *   usd:int,
     *   khr:int,
     *   changeUsd:int,
     *   changeKhr:int,
     *   rate:int,
     *   roundingKhr:int
     * }
     */
    public static function validate(
        int $dueUsdCents,
        array $input,
        bool $defaultUsdToDue = false,
    ): array {
        $rate = ExchangeRate::current();
        if (
            isset($input['exchangeRateKhrPerUsd']) &&
            (int) $input['exchangeRateKhrPerUsd'] !== $rate
        ) {
            throw ValidationException::withMessages([
                'exchangeRateKhrPerUsd' => ['Exchange rate is stale'],
            ]);
        }
        $usd = array_key_exists('usdReceivedCents', $input)
            ? (int) $input['usdReceivedCents']
            : ($defaultUsdToDue ? $dueUsdCents : 0);
        $khr = (int) ($input['khrReceived'] ?? 0);
        $cu = (int) ($input['changeUsdCents'] ?? 0);
        $ck = (int) ($input['changeKhr'] ?? 0);
        if (min($usd, $khr, $cu, $ck) < 0) {
            throw ValidationException::withMessages([
                'payment' => ['Tender and change cannot be negative'],
            ]);
        }
        $due = $dueUsdCents * $rate;
        $tender = $usd * $rate + $khr * 100;
        if ($tender < $due) {
            throw ValidationException::withMessages([
                'payment' => ['Tender is below the amount due'],
            ]);
        }
        $expected = $tender - $due;
        $change = $cu * $rate + $ck * 100;
        $difference = $change - $expected;
        // Walk-in checkout historically stored change as 0 when the
        // cashier omitted it (overpay stays in the drawer). Delayed /pay
        // always sends the breakdown, so it always has to match.
        $hasChangeInput =
            array_key_exists('changeUsdCents', $input) ||
            array_key_exists('changeKhr', $input);
        if ($hasChangeInput || !$defaultUsdToDue) {
            $tolerance = ExchangeRate::increment() * 100;
            if (abs($difference) > $tolerance) {
                throw ValidationException::withMessages([
                    'payment' => [
                        'Change breakdown does not match the expected change',
                    ],
                ]);
            }
        } else {
            $difference = 0;
        }
        return [
            'usd' => $usd,
            'khr' => $khr,
            'changeUsd' => $cu,
            'changeKhr' => $ck,
            'rate' => $rate,
            'roundingKhr' => intdiv($difference, 100),
        ];
    }
}
