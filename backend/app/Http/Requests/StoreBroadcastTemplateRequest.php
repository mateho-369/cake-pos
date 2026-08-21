<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class StoreBroadcastTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'imageUrl' => ['required', 'url', 'max:2048'],
            'caption' => ['required', 'string', 'max:4096'],
        ];
    }
}
