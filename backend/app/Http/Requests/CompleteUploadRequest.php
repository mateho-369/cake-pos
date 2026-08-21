<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class CompleteUploadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'uploadKey' => [
                'required',
                'string',
                'starts_with:product-images/',
                'max:255',
            ],
        ];
    }
}
