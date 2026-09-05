<?php

namespace App\Http\Resources;

use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Order */
class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $this->resource->loadMissing(['cashier', 'customer']);

        // An open order left over from before today is stale: flag it so the
        // pending-orders view can highlight it instead of letting it pile up.
        $open = in_array(
            $this->status,
            ['Pending', 'Confirmed', 'Ready', 'Held'],
            true,
        );
        $isStale = $open && $this->created_at < now()->startOfDay();

        return [
            'id' => $this->id,
            'pickupCode' => $this->pickup_code,
            'isStale' => $isStale,
            'time' => $this->time,
            'date' => $this->date,
            'createdAt' => $this->created_at->toISOString(),
            'cashier' =>
                $this->cashier?->name ??
                ($this->customer ? 'Customer order' : 'Unknown'),
            'customer' => $this->customer
                ? [
                    'name' => $this->customer->name,
                    'phone' => $this->customer->phone,
                    'telegram_username' => $this->customer->telegram_username,
                    // The customer's Telegram chat id — present for everyone
                    // who ordered through the Mini App, so the pending
                    // panel can offer the "Message" action.
                    'telegramUserId' => $this->customer->telegram_user_id,
                ]
                : null,
            'customerId' => $this->customer_id,
            'source' => $this->source,
            'items' => (int) $this->items,
            'subtotal' => Money::toDecimal($this->subtotal_cents),
            'discountType' => $this->discount_type,
            'discountValue' => $this->discountValueForApi(),
            'discountAmount' => Money::toDecimal($this->discount_amount_cents),
            'total' => Money::toDecimal($this->total_cents),
            'payment' => $this->payment,
            'status' => $this->status,
            // Lets the frontend tell a genuine cancellation (rejected before
            // payment) from a hold that was resumed and paid: the latter has a
            // status event with reason `hold_paid` and the paid order id.
            'statusChange' => $this->whenLoaded(
                'statusEvents',
                function () {
                    // created_at has second precision: a hold parked and
                    // paid within the same second has two events with an
                    // identical timestamp, so break the tie on id (newest
                    // row wins) or the release could read as a plain
                    // cancellation.
                    $event = $this->statusEvents
                        ->sortBy(
                            fn($e) => [
                                $e->created_at?->getTimestamp() ?? 0,
                                (int) $e->id,
                            ],
                        )
                        ->last();
                    if (!$event) {
                        return null;
                    }
                    return [
                        'fromStatus' => $event->from_status,
                        'toStatus' => $event->to_status,
                        'reason' => $event->metadata['reason'] ?? null,
                        'paidOrderId' => $event->metadata['paidOrderId'] ?? null,
                    ];
                },
            ),
            'detail' => $this->detail_json,
            // Optional label the cashier typed when parking the order.
            'holdLabel' => $this->hold_label,
            // Only present when the caller eager-loaded orderItems (the held
            // list does, so a hold can be resumed straight into the cart).
            'lineItems' => $this->whenLoaded(
                'orderItems',
                fn() => $this->orderItems
                    ->map(
                        fn($item) => [
                            'productId' => $item->product_id,
                            'description' => $item->description,
                            'quantity' => (int) $item->quantity,
                            // The customer's free-text instruction for this
                            // line ("Happy Birthday John") — null on a
                            // walk-in line. Staff see it on the pending
                            // card and again once the order is accepted.
                            'note' => $item->note,
                            'unitPriceCents' => (int) $item->unit_price_cents,
                        ],
                    )
                    ->values(),
            ),
            'originalOrderId' => $this->parent_order_id,
            'paymentStatus' =>
                $this->payment_status ??
                ($this->status === 'Completed' ? 'paid' : 'unpaid'),
            'fulfillmentStatus' => $this->fulfillment_status ?? $this->status,
            'payments' => $this->whenLoaded(
                'payments',
                fn() => $this->payments
                    ->map(
                        fn($p) => [
                            'id' => $p->id,
                            'method' => $p->method,
                            'status' => $p->status,
                            'amountUsdCents' => $p->amount_usd_cents,
                            'exchangeRateKhrPerUsd' =>
                                $p->exchange_rate_khr_per_usd,
                            'tenderedUsdCents' => $p->tendered_usd_cents,
                            'tenderedKhr' => $p->tendered_khr,
                            'changeUsdCents' => $p->change_usd_cents,
                            'changeKhr' => $p->change_khr,
                            'settlementRoundingKhr' =>
                                $p->settlement_rounding_khr,
                            'confirmedByEmployeeId' =>
                                $p->confirmed_by_employee_id,
                            'confirmedAt' => $p->confirmed_at?->toISOString(),
                        ],
                    )
                    ->values(),
            ),
        ];
    }

    private function discountValueForApi(): ?float
    {
        if ($this->discount_value === null) {
            return null;
        }

        return $this->discount_type === 'percentage'
            ? $this->discount_value / 100
            : Money::toDecimal($this->discount_value);
    }
}
