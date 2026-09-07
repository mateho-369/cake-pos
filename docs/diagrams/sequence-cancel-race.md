# The Two-Door Cancel Race

A not-yet-accepted Telegram order can be cancelled from two different doors at once: the customer tapping "Cancel" in the Mini App, and a cashier tapping "Reject" on the sale terminal after phoning the customer. Both doors lock the same order row and re-check its status only after acquiring that lock, so MySQL — not application luck — decides who gets there first. The loser never double-releases stock and never crashes; it gets a clean `409` explaining the order is already closed.

```mermaid
sequenceDiagram
    actor Customer
    actor Cashier
    participant Shop as apps/shop (Mini App)
    participant Sale as apps/sale (terminal)
    participant API_C as TelegramController::cancelOrder
    participant API_S as OrderController::reject
    participant Svc as CustomerOrderService
    participant DB as MySQL (orders, order_items, products)

    par Nearly simultaneous requests
        Customer->>Shop: Tap "Cancel order"
        Shop->>API_C: POST /customer-orders/:id/cancel
        API_C->>Svc: cancel(customer, order)
    and
        Cashier->>Sale: Tap "Reject" on the pending order
        Sale->>API_S: POST /orders/:id/reject
        API_S->>Svc: rejectByStaff(order, employee, reason)
    end

    Svc->>DB: [customer path] BEGIN; SELECT order FOR UPDATE
    Note over DB: Row lock acquired by whichever\nrequest's transaction reaches\nMySQL first — say, the customer's.
    Svc->>DB: [staff path] BEGIN; SELECT order FOR UPDATE
    Note over DB: Staff's transaction now BLOCKS,\nwaiting for the row lock the\ncustomer's transaction holds.

    Svc->>DB: [customer path] status still Pending/Confirmed/Ready — OK
    Svc->>DB: [customer path] release reserved stock,\nUPDATE orders SET status = Cancelled
    Svc->>DB: [customer path] COMMIT
    Note over DB: Lock released. Staff's blocked\nSELECT ... FOR UPDATE now proceeds\nand re-reads the row.

    Svc->>DB: [staff path] re-read: status is now Cancelled
    Note over Svc: rejectable check fails —\nthe order is no longer\nPending/Confirmed/Ready
    Svc-->>API_S: throw HttpResponseException (409)
    API_S-->>Sale: 409 {"message": "already cancelled by the customer"}
    Sale-->>Cashier: Shows a clean explanation,\nnot a crash or a duplicate action

    API_C-->>Shop: 200 OK — order Cancelled
    Shop-->>Customer: "Your order has been cancelled"
```

If the staff request had reached the lock first instead, the outcome is symmetric: the customer's later cancel attempt is the one that re-reads `Cancelled` and receives the `409`. Whichever request's `SELECT ... FOR UPDATE` commits its `Cancelled` update first always wins — the loser is decided by MySQL's row lock, not by which HTTP request happened to be handled first by PHP.
