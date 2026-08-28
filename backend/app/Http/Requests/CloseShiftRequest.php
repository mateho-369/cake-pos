<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class CloseShiftRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'closingCash' => ['required', 'numeric', 'min:0'],
            // Riel counted at close — whole riel, optional for backward
            // compatibility (defaults to 0 when omitted).
            'closingCashKhr' => ['sometimes', 'integer', 'min:0'],
        ];
    }
}
