<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class ReportFilterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        return [
            'preset' =>
                'nullable|in:today,yesterday,this_week,this_month,last_month,this_year',
            'from' => 'nullable|date_format:Y-m-d',
            'to' => 'nullable|date_format:Y-m-d',
            'timezone' => 'nullable|in:Asia/Phnom_Penh',
            'granularity' => 'nullable|in:day,month',
            'limit' => 'nullable|integer|min:1|max:50',
            'sort' => 'nullable|string|max:40',
            'employee' => 'nullable|integer|min:1',
            'action' => 'nullable|string|max:48',
            // Filter the accountability trail to one product's events (the
            // deactivation / stock-zero reasons recorded via details_json.
            'productId' => 'nullable|integer|min:1',
        ];
    }
}
