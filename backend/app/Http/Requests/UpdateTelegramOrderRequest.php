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
                    'Ready',
                    'Held',
                ]),
            ],
            'total' => ['sometimes', 'required'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $status = $this->input('status');
            if (!in_array($status, ['Paid', 'Completed'], true)) {
                return;
            }
            $validator->errors()->add(
                'status',
                'Paid/Completed must be recorded through the Take Payment action, which creates a real OrderPayment with the method and tender. Status alone cannot mark an order paid.',
            );
        });
    }
}
