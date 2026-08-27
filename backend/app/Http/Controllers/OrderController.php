<?php

namespace App\Http\Controllers;

use App\Http\Requests\{
    CreateOrderCorrectionRequest,
    StoreOrderRequest,
    UpdateTelegramOrderRequest,
    HoldOrderRequest,
    PayOrderRequest,
};
use App\Models\OrderPayment;
use App\Services\PaymentService;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Services\{OrderService, ReceiptService};
use Illuminate\Http\{JsonResponse, Request};

class OrderController extends Controller
{
    public function __construct(
        private readonly OrderService $orders,
        private readonly ReceiptService $receipts,
        private readonly PaymentService $payments,
    ) {}

    public function hold(HoldOrderRequest $request): JsonResponse
    {
        return response()->json(
            OrderResource::make(
                $this->orders->hold($request->validated(), $request->user()),
            )->resolve(),
            201,
        );
    }
    public function pay(PayOrderRequest $request, Order $order): JsonResponse
    {
        $method = strtolower((string) $request->method);
        $payment =
            $method === 'cash'
                ? $this->payments->confirmCash(
                    $order,
                    $request->validated(),
                    $request->user(),
                )
                : ($request->boolean('confirmed')
                    ? $this->payments->confirmManualQr($order, $request->user())
                    : abort(422, 'Cashier confirmation is required'));
        $this->receipts->ensure($order->fresh(), true);
        return response()->json(
            OrderResource::make($order->fresh())->resolve(),
        );
    }
    public function cancel(Request $request, Order $order): JsonResponse
    {
        $this->orders->cancel($order, $request->user());
        return response()->json(
            OrderResource::make($order->fresh())->resolve(),
        );
    }
    public function held(): JsonResponse
    {
        return response()->json(
            OrderResource::collection(
                Order::where('status', 'Held')->latest()->get(),
            )->resolve(),
        );
    }

    /**
     * Open customer (Telegram) orders awaiting staff action — the live
     * "pending customer orders" panel on the sale terminal and admin polls
     * this lightweight endpoint.
     */
    public function pending(): JsonResponse
    {
        $orders = Order::with(['customer'])
            ->where('source', 'telegram')
            ->where('payment_status', '!=', 'paid')
            ->whereIn('status', ['Pending', 'Confirmed', 'Ready'])
            ->latest('created_at')
            ->get();
        return response()->json(OrderResource::collection($orders)->resolve());
    }

    public function index(): JsonResponse
    {
        $orders = Order::with(['cashier', 'customer'])
            ->latest('created_at')
            ->get();
        return response()->json(OrderResource::collection($orders)->resolve());
    }

    public function store(StoreOrderRequest $request): JsonResponse
    {
        $result = $this->orders->createWalkIn(
            $request->validated(),
            $request->user(),
        );
        if ($result->wasCreated) {
            $this->receipts->ensure($result->order);
        }

        return response()->json(
            OrderResource::make($result->order)->resolve(),
            $result->wasCreated ? 201 : 200,
        );
    }

    public function update(
        UpdateTelegramOrderRequest $request,
        Order $order,
    ): JsonResponse {
        $updated = $this->orders->updateTelegram(
            $order,
            $request->validated(),
            $request->user(),
        );
        if ($updated->status === 'Completed') {
            $this->receipts->ensure($updated, true);
        }
        return response()->json(OrderResource::make($updated)->resolve());
    }

    public function correct(
        CreateOrderCorrectionRequest $request,
        Order $order,
    ): JsonResponse {
        $correction = $this->orders->correct(
            $order,
            $request->validated(),
            $request->user(),
        );
        return response()->json(
            OrderResource::make($correction)->resolve(),
            201,
        );
    }
}
