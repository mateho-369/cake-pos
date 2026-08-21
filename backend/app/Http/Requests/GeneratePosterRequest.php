<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class GeneratePosterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'productId' => ['required', 'integer', 'exists:products,id'],
            'template' => ['required', 'in:new_arrival,selling_fast,seasonal'],
            'headline' => ['nullable', 'string', 'max:160'],
        ];
    }
}
