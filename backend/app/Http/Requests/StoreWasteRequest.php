<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class StoreWasteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'productId' => ['required', 'integer', 'exists:products,id'],
            'quantity' => ['required', 'integer', 'min:1'],
            'reason' => [
                'required',
                'string',
                'in:expired,damaged,quality,staff_meal',
            ],
            'note' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }
}
