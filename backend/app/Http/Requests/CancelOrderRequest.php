<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class CancelOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            // Why the order was rejected/discarded, e.g. "customer didn't
            // place it". Optional — goes to the audit trail and status
            // event only, never to the customer.
            'reason' => ['nullable', 'string', 'max:280'],
        ];
    }
}
