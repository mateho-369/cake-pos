# POS integrity verification matrix

All backend checks are in `backend/tests/Feature/ApiContractTest.php` and target MySQL, not SQLite.

| Requirement | Enforcement | Integration test |
|---|---|---|
| Login brute-force protection | Named Laravel limiter, five requests/IP/minute, JSON 429 and Retry-After | `test_pin_login_is_limited_to_five_attempts_per_ip_per_minute` |
| Integer money | BIGINT cent columns, `Money` decimal-boundary parser, integer basis points and arithmetic | `test_money_is_stored_and_calculated_only_as_integer_cents` |
| Discounts | DB-priced subtotal, fixed/percentage discounts, cashier effective-rate ceiling from `pos_rules`, zero floor | `test_discount_rules_are_server_computed_capped_and_never_negative` |
| Idempotency | Nullable unique UUID and duplicate-key recovery returning the first order | `test_idempotency_returns_original_order_and_decrements_stock_once` |
| Stock concurrency | Product rows read with `lockForUpdate()` inside the order transaction | `test_order_creation_uses_for_update_and_rolls_back_stock_failure` asserts generated SQL contains `FOR UPDATE` |
| Immutable completion | PATCH rejects Completed; correction endpoint creates a linked negative row while locking the original | `test_completed_order_is_immutable_and_correction_is_linked` |
| Token lifetime/revocation | Sanctum 720-minute expiry, explicit per-token expiry, logout deletes current token | `test_email_and_pin_login_issue_tokens_with_twelve_hour_expiry` and `test_logout_deletes_the_current_sanctum_token` |
| Telegram-only customers | Shop launch gate plus HMAC verification on every customer endpoint | `test_customer_endpoints_reject_missing_and_bad_init_data_and_accept_valid_signature` |

The suite also checks cent-based shift variance and reports response compatibility. Run against a disposable MySQL database:

```bash
cd backend
php artisan test --filter ApiContractTest
```
