<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class PosRulesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'maxCashierDiscountPercent' => [
                'required',
                'numeric',
                'min:0',
                'max:100',
            ],
            'khqrImageUrl' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'exchangeRateKhrPerUsd' => ['sometimes', 'integer', 'min:1000', 'max:10000'],
            'khrRoundingIncrement' => ['sometimes', 'integer', 'min:1', 'max:100000'],
            'shiftClosingPolicy' => ['sometimes', 'string', 'in:opener_or_admin,admin_only'],
        ];
    }
}
