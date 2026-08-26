<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class BusinessProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'businessName' => ['required', 'string', 'max:120'],
            'locationName' => ['nullable', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40'],
            'timezone' => ['required', 'string', 'timezone'],
            'primaryCurrency' => ['required', 'string', 'in:USD,KHR'],
            'secondaryCurrency' => ['required', 'string', 'in:none,USD,KHR'],
        ];
    }
}
