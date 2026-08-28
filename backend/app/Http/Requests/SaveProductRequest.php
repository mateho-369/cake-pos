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
            // Prefer categoryId: it stays correct through renames and never
            // collides when two categories share a name. The plain `category`
            // name string is still accepted for backward compatibility (the
            // sale terminal quick-add and CSV import send names). At least
            // one of the two must resolve to an existing active category —
            // enforced in ProductService against the real categories table,
            // never against a hardcoded list.
            'category' => [
                $this->isMethod('post') ? 'required_without:categoryId' : 'sometimes',
                'string',
            ],
            'categoryId' => [
                $this->isMethod('post') ? 'required_without:category' : 'sometimes',
                'integer',
            ],
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
            // Accountability: required when this update deactivates a
            // product or manually zeroes its stock (sale-driven depletion
            // never goes through this endpoint, so any zero here is manual).
            'reasonCode' => [
                'sometimes',
                'string',
                'in:out_of_stock,discontinued,quality,seasonal_return,other',
            ],
            'reasonNote' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }
}
