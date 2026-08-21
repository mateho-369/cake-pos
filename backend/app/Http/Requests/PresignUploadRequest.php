<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
class PresignUploadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'fileName' => ['required', 'string', 'max:255'],
            'contentType' => [
                'required',
                Rule::in(['image/jpeg', 'image/png', 'image/webp']),
            ],
            'fileSize' => ['required', 'integer', 'min:1', 'max:10485760'],
        ];
    }
}
