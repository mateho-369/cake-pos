<?php

namespace App\Http\Controllers;

use App\Http\Requests\{
    BusinessProfileRequest,
    PosRulesRequest,
    ReceiptTemplateRequest,
};
use App\Models\Setting;
use App\Support\Money;
use Illuminate\Http\JsonResponse;

class SettingsController extends Controller
{
    public function receiptTemplate(): JsonResponse
    {
        return response()->json(Setting::find('receipt_template')?->value_json);
    }

    public function businessProfile(): JsonResponse
    {
        return response()->json(
            Setting::find('business_profile')?->value_json ?? [
                'businessName' => '',
                'locationName' => '',
                'address' => '',
                'phone' => '',
                'timezone' => 'Asia/Phnom_Penh',
                'primaryCurrency' => 'USD',
                'secondaryCurrency' => 'none',
            ],
        );
    }

    public function updateBusinessProfile(
        BusinessProfileRequest $request,
    ): JsonResponse {
        $values = $request->validated();
        Setting::updateOrCreate(
            ['key' => 'business_profile'],
            ['value_json' => $values, 'updated_at' => now()],
        );
        return response()->json($values);
    }

    public function updateReceiptTemplate(
        ReceiptTemplateRequest $request,
    ): JsonResponse {
        $values = $request->validated();

        Setting::updateOrCreate(
            ['key' => 'receipt_template'],
            ['value_json' => $values, 'updated_at' => now()],
        );
        return response()->json($values);
    }

    public function posRules(): JsonResponse
    {
        return response()->json(
            Setting::find('pos_rules')?->value_json ?? [
                'maxCashierDiscountPercent' => 10,
                'exchangeRateKhrPerUsd' => 4100,
                'khrRoundingIncrement' => 100,
                'shiftClosingPolicy' => 'opener_or_admin',
                'defaultShelfLifeDays' => 3,
                'warningDays' => 1,
            ],
        );
    }

    public function updatePosRules(PosRulesRequest $request): JsonResponse
    {
        Money::percentToBasisPoints($request->maxCashierDiscountPercent);
        $values = array_merge(
            Setting::find('pos_rules')?->value_json ?? [],
            $request->validated(),
            [
                'maxCashierDiscountPercent' =>
                    (float) $request->maxCashierDiscountPercent,
            ],
        );
        Setting::updateOrCreate(
            ['key' => 'pos_rules'],
            ['value_json' => $values, 'updated_at' => now()],
        );
        return response()->json($values);
    }
}
