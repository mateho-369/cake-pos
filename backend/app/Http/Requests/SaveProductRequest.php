<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class SaveProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        $presence = $this->isMethod('post') ? 'required' : 'sometimes';
        return [
            'name' => [$presence, 'string'],
            'category' => [$presence, 'string'],
            'price' => [$presence],
            'stock' => [$presence, 'integer', 'min:0'],
            'madeAt' => ['sometimes', 'date'],
            'bestBefore' => ['sometimes'],
            'imagePosition' => ['sometimes', 'string'],
            'imageUrl' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'images' => ['sometimes', 'array', 'max:5'],
            'images.*.url' => ['required_with:images', 'url', 'max:2048'],
            'images.*.caption' => ['nullable', 'string', 'max:500'],
            'images.*.sortOrder' => ['sometimes', 'integer', 'min:0'],
            'active' => ['sometimes', 'boolean'],
            'hideWhenOutOfStock' => ['sometimes', 'boolean'],
        ];
    }
}
