<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'idempotencyKey' =>
                $this->input('idempotencyKey') ??
                $this->header('Idempotency-Key'),
        ]);
    }

    public function rules(): array
    {
        return [
            'payment' => [
                'required',
                Rule::in(['Cash', 'cash', 'KHQR', 'khqr']),
            ],
            'items' => ['required', 'array', 'min:1'],
            'items.*.productId' => [
                'required_without:items.*.id',
                'integer',
                'min:1',
            ],
            'items.*.id' => [
                'required_without:items.*.productId',
                'integer',
                'min:1',
            ],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'idempotencyKey' => ['nullable', 'uuid'],
            'discount.type' => ['nullable', Rule::in(['percentage', 'fixed'])],
            'discount.amount' => ['required_with:discount.type'],
            'usdReceivedCents' => ['integer', 'min:0'],
            'khrReceived' => ['integer', 'min:0'],
            'changeUsdCents' => ['integer', 'min:0'],
            'changeKhr' => ['integer', 'min:0'],
            'exchangeRateKhrPerUsd' => ['integer', 'min:1000', 'max:10000'],
            'confirmed' => ['boolean'],
        ];
    }
}
