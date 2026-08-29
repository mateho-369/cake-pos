<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class MessageCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    protected function prepareForValidation(): void
    {
        // A whitespace-only note is no note at all — trim before the rules
        // run so "   " fails `required` instead of messaging the customer
        // an empty bubble.
        $this->merge(['text' => trim((string) $this->input('text'))]);
    }
    public function rules(): array
    {
        return [
            // Telegram caps messages at ~4096 chars; 1000 keeps staff notes
            // short and readable on the customer's phone.
            'text' => ['required', 'string', 'min:1', 'max:1000'],
        ];
    }
}
