# Entity-Relationship Diagram

This is the real shape of the sales data in MySQL, pulled directly from the migration files (not simplified): who placed an order, what was in it, how it was paid for, and its full status history. Column names and types are copied from the migrations as written today.

```mermaid
erDiagram
    EMPLOYEES ||--o{ ORDERS : "rings up (cashier_id)"
    EMPLOYEES ||--o{ SHIFTS : "works"
    EMPLOYEES ||--o{ ORDER_PAYMENTS : "confirms (confirmed_by_employee_id)"
    EMPLOYEES ||--o{ ORDER_STATUS_EVENTS : "acts (employee_id)"
    EMPLOYEES ||--o{ CATEGORIES : "proposes (created_by_employee_id)"

    CUSTOMERS ||--o{ ORDERS : "places (customer_id)"

    CATEGORIES ||--o{ CATEGORIES : "parent_category_id (one level)"
    CATEGORIES ||--o{ PRODUCTS : "groups (category_id)"

    PRODUCTS ||--o{ ORDER_ITEMS : "sold as (product_id, nullable)"

    ORDERS ||--o{ ORDER_ITEMS : "contains"
    ORDERS ||--o{ ORDER_PAYMENTS : "settled by"
    ORDERS ||--o{ ORDER_STATUS_EVENTS : "history"
    ORDERS ||--o{ ORDERS : "parent_order_id (corrections)"

    SHIFTS ||--o{ ORDER_PAYMENTS : "attributes cash to (shift_id)"

    EMPLOYEES {
        bigint id PK
        string name
        string email
        string role "admin | cashier"
        string password_hash
        string pin_hash
        boolean active
    }

    CUSTOMERS {
        bigint id PK
        string telegram_user_id UK
        string name
        string phone
        string telegram_username
        timestamp first_seen_at
    }

    CATEGORIES {
        bigint id PK
        bigint parent_category_id FK "nullable, self-ref"
        string name UK
        string color
        boolean active
        int sort_order
        boolean pending_review "cashier-proposed"
        bigint created_by_employee_id FK "nullable"
    }

    PRODUCTS {
        bigint id PK
        string name
        bigint category_id FK
        bigint price_cents
        int stock
        int reserved_stock "held by unpaid orders"
        int sold
        bigint revenue_cents
        date made_at
        date best_before
        boolean active
    }

    ORDERS {
        string id PK "CS-n / TG-n / RF-n"
        string pickup_code "nullable, Telegram lookup"
        bigint cashier_id FK "nullable"
        bigint customer_id FK "nullable"
        string parent_order_id FK "nullable, self-ref: corrections"
        uuid idempotency_key UK "nullable"
        string source "walk-in | telegram"
        bigint subtotal_cents
        string discount_type "nullable: percentage | fixed"
        int discount_value "nullable"
        bigint discount_amount_cents
        bigint total_cents
        string payment "nullable: Cash | KHQR"
        string status "Pending/Confirmed/Ready/Held/Completed/Cancelled/..."
        string payment_status "unpaid | paid"
        string fulfillment_status "nullable"
        string hold_label "nullable"
        json detail_json
        timestamp created_at
    }

    ORDER_ITEMS {
        bigint id PK
        string order_id FK
        bigint product_id FK "nullable"
        string description "nullable, snapshot"
        string category_snapshot "nullable"
        int quantity
        string note "nullable, max 200 chars"
        bigint unit_price_cents
        bigint line_subtotal_cents
        bigint line_discount_cents
        bigint line_total_cents
    }

    ORDER_PAYMENTS {
        bigint id PK
        string order_id FK
        bigint shift_id FK "nullable, set at confirmation"
        string method "cash | qr_manual"
        string status "confirmed | failed"
        bigint amount_usd_cents
        int exchange_rate_khr_per_usd
        bigint tendered_usd_cents "nullable"
        bigint tendered_khr "nullable"
        bigint change_usd_cents "nullable"
        bigint change_khr "nullable"
        bigint settlement_rounding_khr
        string external_reference "nullable"
        bigint confirmed_by_employee_id FK "nullable"
        timestamp confirmed_at "nullable"
        json metadata "nullable"
    }

    ORDER_STATUS_EVENTS {
        bigint id PK
        string order_id FK
        string from_status "nullable"
        string to_status
        bigint employee_id FK "nullable"
        json metadata "nullable"
    }

    SHIFTS {
        bigint id PK
        bigint employee_id FK
        bigint opened_by_employee_id FK "nullable"
        bigint closed_by_employee_id FK "nullable"
        bigint opening_cash_usd_cents
        bigint opening_cash_khr
        bigint expected_cash_usd_cents "nullable"
        bigint closing_cash_usd_cents "nullable"
        bigint variance_usd_cents "nullable"
        timestamp opened_at
        timestamp closed_at "nullable"
        string status "Open | Closed"
    }
```

Two tables exist purely to make the above race-safe and are intentionally left off the diagram since they hold no business data: `order_number_sequences` (one row per order-id prefix, row-locked to hand out the next number) and `store_shift_locks` (a single always-present row, row-locked so two "open shift" requests can never both succeed).
