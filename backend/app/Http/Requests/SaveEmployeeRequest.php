<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
class SaveEmployeeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if (
                $this->isMethod('post') &&
                !$this->filled('password') &&
                !$this->filled('pin_code')
            ) {
                $validator
                    ->errors()
                    ->add(
                        'credentials',
                        'name and password or pin are required',
                    );
            }
        });
    }

    public function rules(): array
    {
        $presence = $this->isMethod('post') ? 'required' : 'sometimes';
        $employee = $this->route('employee');
        return [
            'name' => [$presence, 'string'],
            'email' => [
                'nullable',
                'email',
                Rule::unique('employees')->ignore($employee?->id),
            ],
            'role' => [
                'sometimes',
                Rule::in(['admin', 'Admin', 'cashier', 'Cashier']),
            ],
            'password' => ['nullable', 'string'],
            'pin_code' => ['nullable', 'string', 'min:4', 'max:12'],
            'active' => ['sometimes', 'boolean'],
        ];
    }
}
