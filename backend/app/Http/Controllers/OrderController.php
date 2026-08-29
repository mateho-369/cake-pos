<?php

namespace App\Http\Controllers;

use App\Http\Requests\{
    CancelOrderRequest,
    CreateOrderCorrectionRequest,
    MessageCustomerRequest,
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
use Illuminate\Http\JsonResponse;

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
    /**
     * Cancel an order: discard a walk-in hold, or REJECT a pending Telegram
     * customer order (staff verified it was not real). Reserved stock is
     * released; the customer is notified through the shop bot. The optional
     * reason is recorded in the audit trail, not sent to the customer.
     */
    public function cancel(
        CancelOrderRequest $request,
        Order $order,
    ): JsonResponse {
        $this->orders->cancel(
            $order,
            $request->user(),
            $request->validated('reason'),
        );
        return response()->json(
            OrderResource::make($order->fresh())->resolve(),
        );
    }
    /**
     * Staff's quick manual note to the customer who placed this order,
     * delivered by the shop bot through the same sendMessage path as the
     * order-status notifications.
     */
    public function message(
        MessageCustomerRequest $request,
        Order $order,
    ): JsonResponse {
        $delivered = $this->orders->messageCustomer(
            $order,
            (string) $request->validated('text'),
            $request->user(),
        );
        return response()->json(['delivered' => $delivered]);
    }
    /**
     * Held ("parked") walk-in orders waiting for the customer to come back
     * and pay. Oldest first: it is a queue, and the cashier serves the
     * longest-waiting customer first. Line items are eager-loaded because
     * resuming a hold puts its products back into the cart.
     */
    public function held(): JsonResponse
    {
        return response()->json(
            OrderResource::collection(
                Order::with(['cashier', 'customer', 'orderItems'])
                    ->where('status', 'Held')
                    ->orderBy('created_at')
                    ->get(),
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
