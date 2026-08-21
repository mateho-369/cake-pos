<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class DeleteMediaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'keys' => 'required|array|min:1|max:200',
            'keys.*' => 'required|string|starts_with:product-images/|max:255',
        ];
    }
}
