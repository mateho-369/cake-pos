<?php
namespace App\Http\Controllers;
use App\Http\Requests\ReportFilterRequest;
use App\Services\ReportingService;
use Illuminate\Http\JsonResponse;
class ReportController extends Controller
{
    public function __construct(private ReportingService $reports) {}
    private function get(
        string $method,
        ReportFilterRequest $request,
    ): JsonResponse {
        return response()->json(
            $this->reports->{$method}($request->validated()),
        );
    }
    public function dashboard(ReportFilterRequest $r): JsonResponse
    {
        return response()->json([
            'summary' => $this->reports->summary($r->validated()),
            'trend' => $this->reports->trend($r->validated()),
            'products' => $this->reports->products($r->validated()),
            'categories' => $this->reports->categories($r->validated()),
            'payments' => $this->reports->payments($r->validated()),
            'peakHours' => $this->reports->peakHours($r->validated()),
            'customers' => $this->reports->customers($r->validated()),
        ]);
    }
    public function summary(ReportFilterRequest $r): JsonResponse
    {
        $v = $r->validated();
        $s = $this->reports->summary($v);
        $t = $this->reports->trend($v);
        return response()->json(
            array_merge($s, [
                'todaySalesTotal' => $s['netRevenueCents'] / 100,
                'todayOrdersCount' => $s['completedOrderCount'],
                'revenueData' => array_map(
                    fn($p) => [
                        'day' => $p['period'],
                        'value' => $p['netRevenueCents'] / 100,
                    ],
                    $t,
                ),
                'topProducts' => $this->reports->products($v),
            ]),
        );
    }
    public function trend(ReportFilterRequest $r): JsonResponse
    {
        return $this->get('trend', $r);
    }
    public function products(ReportFilterRequest $r): JsonResponse
    {
        return $this->get('products', $r);
    }
    public function categories(ReportFilterRequest $r): JsonResponse
    {
        return $this->get('categories', $r);
    }
    public function payments(ReportFilterRequest $r): JsonResponse
    {
        return $this->get('payments', $r);
    }
    public function cashiers(ReportFilterRequest $r): JsonResponse
    {
        return $this->get('cashiers', $r);
    }
    public function peakHours(ReportFilterRequest $r): JsonResponse
    {
        return $this->get('peakHours', $r);
    }
    public function waste(ReportFilterRequest $r): JsonResponse
    {
        return $this->get('waste', $r);
    }
    public function customers(ReportFilterRequest $r): JsonResponse
    {
        return $this->get('customers', $r);
    }
}
