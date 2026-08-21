<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class SaveCategoryRequest extends FormRequest
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
            'color' => ['nullable', 'string'],
            'active' => ['sometimes', 'boolean'],
            'sortOrder' => ['sometimes', 'integer', 'min:0'],
        ];
    }
}
