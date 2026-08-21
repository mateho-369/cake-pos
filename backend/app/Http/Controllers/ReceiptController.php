<?php
namespace App\Http\Controllers;
use App\Models\Order;
use App\Services\ReceiptService;
use Illuminate\Http\{JsonResponse, Request};
class ReceiptController extends Controller
{
    public function show(
        Request $request,
        Order $order,
        ReceiptService $receipts,
    ): JsonResponse {
        $copies = $request->query('copies') === '2' ? 2 : 1;
        return response()->json([
            'html' => $receipts->html($receipts->ensure($order), $copies),
        ]);
    }
}
