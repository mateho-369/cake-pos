<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
class ReceiptTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'paperSize' => ['required', Rule::in(['58mm', '80mm', 'A4'])],
            'language' => ['required', Rule::in(['en', 'km'])],
            'businessName' => ['required', 'string'],
            'address' => ['nullable', 'string'],
            'logoUrl' => ['nullable', 'string'],
            'footerMessage' => ['nullable', 'string'],
        ];
    }
}
