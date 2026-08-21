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
            'email' => ['nullable', 'email'],
            'password' => ['nullable', 'string'],
            'pin_code' => ['nullable', 'string'],
        ];
    }
}
