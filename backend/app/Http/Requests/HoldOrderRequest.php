<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Validator;
class HoldOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'items' => 'required|array|min:1',
            'items.*.productId' => 'required|integer|min:1',
            'items.*.quantity' => 'required|integer|min:1',
            'discount.type' => 'nullable|in:percentage,fixed',
            'discount.amount' => 'required_with:discount.type',
            'idempotencyKey' => 'nullable|uuid',
            // Optional human label ("Dara — 4pm") so several holds can be
            // told apart at the terminal.
            'holdLabel' => 'nullable|string|max:80',
        ];
    }
}
