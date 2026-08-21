<?php

namespace App\Http\Controllers;

use App\Http\Requests\{
    CreateOrderCorrectionRequest,
    StoreOrderRequest,
    UpdateTelegramOrderRequest,
};
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Services\{OrderService, ReceiptService};
use Illuminate\Http\JsonResponse;

class OrderController extends Controller
{
    public function __construct(
        private readonly OrderService $orders,
        private readonly ReceiptService $receipts,
    ) {}

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
        $updated = $this->orders->updateTelegram($order, $request->validated());
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
