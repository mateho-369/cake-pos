<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateTelegramOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'status' => [
                'sometimes',
                Rule::in([
                    'Pending',
                    'Confirmed',
                    'Paid',
                    'Ready',
                    'Completed',
                ]),
            ],
            'total' => ['sometimes', 'required'],
        ];
    }
}
