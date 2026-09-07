<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'email' => ['nullable', 'email', 'max:255'],
            'password' => ['nullable', 'string', 'max:255'],
            'pin_code' => ['nullable', 'string', 'max:32'],
        ];
    }
}
