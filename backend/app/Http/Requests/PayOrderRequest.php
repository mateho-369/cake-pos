<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class PayOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'method' => ['required', 'in:cash,qr_manual,Cash,KHQR'],
            'usdReceivedCents' => ['integer', 'min:0'],
            'khrReceived' => ['integer', 'min:0'],
            'changeUsdCents' => ['integer', 'min:0'],
            'changeKhr' => ['integer', 'min:0'],
            'exchangeRateKhrPerUsd' => ['integer', 'min:1000', 'max:10000'],
            'confirmed' => ['boolean'],
        ];
    }
}
