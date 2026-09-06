<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $presence = $this->isMethod('post') ? 'required' : 'sometimes';
        $category = $this->route('category');

        return [
            'name' => [
                $presence,
                'string',
                Rule::unique('categories', 'name')->ignore($category?->id),
            ],
            'color' => ['nullable', 'string'],
            'active' => ['sometimes', 'boolean'],
            'sortOrder' => ['sometimes', 'integer', 'min:0'],
            // One level of hierarchy only: the referenced parent must exist
            // and must itself be top-level (enforced in the controller so a
            // self-reference can be rejected with a clear message too).
            'parentCategoryId' => [
                'sometimes',
                'nullable',
                'integer',
                'exists:categories,id',
            ],
        ];
    }
}
