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
            'preset' => 'nullable|in:today,yesterday,this_week,this_month',
            'from' => 'nullable|date_format:Y-m-d',
            'to' => 'nullable|date_format:Y-m-d',
            'timezone' => 'nullable|in:Asia/Phnom_Penh',
            'granularity' => 'nullable|in:day,month',
            'limit' => 'nullable|integer|min:1|max:50',
            'sort' => 'nullable|string|max:40',
        ];
    }
}
