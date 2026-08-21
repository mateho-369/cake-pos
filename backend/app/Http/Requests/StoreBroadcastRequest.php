<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class StoreBroadcastRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'imageUrl' => ['nullable', 'url', 'max:2048'],
            'caption' => ['required', 'string', 'max:1024'],
            'message' => ['nullable', 'string', 'max:4096'],
        ];
    }
}
