<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class OpenShiftRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'openingCash' => ['required', 'numeric', 'min:0'],
            // Riel counted in the drawer at open — whole riel, optional for
            // backward compatibility (defaults to 0 when omitted).
            'openingCashKhr' => ['sometimes', 'integer', 'min:0'],
        ];
    }
}
