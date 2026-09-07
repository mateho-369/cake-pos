# Order Journey

This shows the two ways an order is born — a customer ordering through the Telegram Mini App, or a cashier ringing up a walk-in sale — and every status change each one can go through, exactly as the backend enforces it today. "Customer action", "Staff action" and "System action" label who or what actually causes each arrow.

```mermaid
stateDiagram-v2
    [*] --> Pending: Customer places a Telegram order\n(POST /customer-orders)

    Pending --> Confirmed: Staff edits status\n(PATCH /orders/:id, admin only)
    Confirmed --> Ready: Staff edits status\n(PATCH /orders/:id, admin only)
    Pending --> Ready: Staff edits status\n(PATCH /orders/:id, admin only)

    Pending --> Held: Staff accepts the order\n(POST /orders/:id/accept)
    Confirmed --> Held: Staff accepts the order\n(POST /orders/:id/accept)
    Ready --> Held: Staff accepts the order\n(POST /orders/:id/accept)

    Pending --> Cancelled: Customer cancels in the Mini App\n(POST /customer-orders/:id/cancel)\n— OR — Staff rejects it\n(POST /orders/:id/reject)
    Confirmed --> Cancelled: Customer cancels — OR — Staff rejects
    Ready --> Cancelled: Customer cancels — OR — Staff rejects

    Held --> Cancelled: Staff cancels the held order\n(POST /orders/:id/cancel)
    Held --> Completed: Staff takes payment\n(POST /orders/:id/pay)\nSystem: settles stock + revenue

    [*] --> Held: Cashier holds a walk-in cart\n(POST /orders/hold)
    [*] --> Completed: Cashier rings a walk-in sale\npaid immediately (POST /orders)

    Completed --> [*]
    Cancelled --> [*]

    note right of Pending
        Once a customer order reaches Held,
        it is staff-owned: the customer can
        no longer self-cancel it — only staff
        can cancel or complete it from here.
    end note

    note right of Completed
        Completed orders are immutable.
        A mistake after this point is fixed
        with a correction record, never by
        editing the completed order.
    end note
```
