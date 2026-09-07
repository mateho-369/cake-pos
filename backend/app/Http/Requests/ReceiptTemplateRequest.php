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
            'businessName' => ['required', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
            'logoUrl' => ['nullable', 'string', 'max:2048'],
            'footerMessage' => ['nullable', 'string', 'max:500'],
        ];
    }
}
