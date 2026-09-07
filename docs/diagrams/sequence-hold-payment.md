# Hold → Resume → Payment Sequence

This traces a cashier building a cart, parking it as a hold so the customer can pay later, resuming it, and taking payment. Stock is reserved the moment the hold is created — not left free for someone else to sell — and the hold is only cleared once payment is confirmed, inside the very same database transaction that records the sale.

```mermaid
sequenceDiagram
    actor Cashier
    participant SaleApp as apps/sale (cart UI)
    participant API as OrderController
    participant Svc as OrderService / PaymentService
    participant DB as MySQL (products, orders, order_items, order_payments)

    Cashier->>SaleApp: Add items to cart
    Note over SaleApp: Cart lives only in the\nbrowser until held or paid

    Cashier->>SaleApp: Tap "Hold order"
    SaleApp->>API: POST /orders/hold
    API->>Svc: OrderService::hold(input, employee)
    activate Svc
    Svc->>DB: BEGIN TRANSACTION
    Svc->>DB: SELECT ... FOR UPDATE (lock each product row)
    Svc->>DB: INSERT orders (status = Held)
    Svc->>DB: UPDATE products SET reserved_stock += qty
    Svc->>DB: INSERT order_items
    Svc->>DB: COMMIT
    deactivate Svc
    API-->>SaleApp: 201 Created (order, status: Held)
    Note over DB: Reserved units are now invisible\nas "available" stock to every\nother terminal and the shop app

    Cashier->>SaleApp: Later — open "Held orders"
    SaleApp->>API: GET /orders/held
    API-->>SaleApp: List of Held orders, oldest first
    Cashier->>SaleApp: Tap the held order (Resume)
    Note over SaleApp: Cart is rebuilt from the\nheld order's line items

    Cashier->>SaleApp: Tap "Take Payment"
    SaleApp->>API: POST /orders/:id/pay {method, tender}
    API->>Svc: PaymentService::confirm(order, method, input, employee)
    activate Svc
    Svc->>DB: BEGIN TRANSACTION
    Svc->>DB: SELECT order FOR UPDATE
    Svc->>DB: INSERT order_payments (status = confirmed, shift_id)
    Svc->>DB: UPDATE orders SET status = Completed
    Svc->>DB: SELECT products FOR UPDATE
    Svc->>DB: UPDATE products SET stock -= qty, reserved_stock -= qty,\n  sold += qty, revenue_cents += qty's share
    Svc->>DB: COMMIT
    deactivate Svc
    API-->>SaleApp: 200 OK (order, status: Completed)
    Note over Svc,DB: The hold is "released" simply by\nthe order leaving Held — there is\nno separate release step, so a\ncrash mid-payment can never leave\nstock reserved with no matching order
```
