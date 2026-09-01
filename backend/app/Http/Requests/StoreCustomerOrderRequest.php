<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Telegram Mini App order submission. Only the free-text per-line note is
 * validated here — quantities, prices and stock stay in
 * CustomerOrderService, which has to re-check them under a row lock anyway.
 */
class StoreCustomerOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    protected function prepareForValidation(): void
    {
        // A whitespace-only note is no note at all — trim before the rules
        // run (same treatment as MessageCustomerRequest) so "   " becomes
        // null instead of an empty line on the staff card.
        $items = $this->input('items');
        if (!is_array($items)) {
            return;
        }
        $this->merge([
            'items' => array_map(function ($item) {
                if (!is_array($item) || !array_key_exists('note', $item)) {
                    return $item;
                }
                $note = is_scalar($item['note'])
                    ? trim((string) $item['note'])
                    : '';
                $item['note'] = $note === '' ? null : $note;
                return $item;
            }, $items),
        ]);
    }
    public function rules(): array
    {
        return [
            'items' => ['sometimes', 'array'],
            // Optional customer instruction for that line ("Happy Birthday
            // John", "less sugar"). 200 chars keeps it readable on the
            // staff pending card and inside the Telegram notification —
            // the same "trim, then cap" shape as MessageCustomerRequest.
            'items.*.note' => ['sometimes', 'nullable', 'string', 'max:200'],
        ];
    }
    public function messages(): array
    {
        return [
            'items.*.note.max' =>
                'A note can be at most 200 characters — please shorten it.',
        ];
    }
}
