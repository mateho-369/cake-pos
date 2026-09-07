# វីដេអូ ៥ — Entity-Relationship Diagram (ERD)

**ប្រភព Diagram:** `docs/diagrams/erd.md`
**អ្នកទស្សនា:** ផ្នែកខាងក្នុង / បច្ចេកទេស (បង្ហាញឈ្មោះ table និង column ពិតពី migrations)
**រយៈពេលប៉ាន់ស្មាន:** ~៨៧ វិនាទី

រូបភាពត្រូវតែឆ្លុះបញ្ចាំងទំរង់ពិតរបស់ erDiagram៖ ទំនាក់ទំនងរវាង table នីមួយៗ និងឈ្មោះ column ពិត (មិនមែនការប៉ាន់ស្មានសាមញ្ញ)។

---

## ស្គ្រីបនិទាយខ្មែរ (Khmer Narration Script)

**Scene 1 — តារាង ៩ (០:០០–០:១៨)**
វីដេអូនេះសម្រាប់អ្នកបច្ចេកទេស។ នេះជាទំរង់ពិតនៃទិន្នន័យការលក់ក្នុង MySQL ដែលយកពី migration files។ មានតារាង ៩៖ `EMPLOYEES`, `CUSTOMERS`, `CATEGORIES`, `PRODUCTS`, `ORDERS`, `ORDER_ITEMS`, `ORDER_PAYMENTS`, `ORDER_STATUS_EVENTS`, `SHIFTS`។
*(Technical video. This is the real shape of the sales data in MySQL, pulled from the migration files. There are 9 tables: EMPLOYEES, CUSTOMERS, CATEGORIES, PRODUCTS, ORDERS, ORDER_ITEMS, ORDER_PAYMENTS, ORDER_STATUS_EVENTS, SHIFTS.)*

**Scene 2 — ទំនាក់ទំនងស្នូល (០:១៨–០:៤២)**
`EMPLOYEES` រំលង ១-ច្រើនជាមួយ `ORDERS` (cashier_id), `SHIFTS` (works), `ORDER_PAYMENTS` (confirmed_by_employee_id), `ORDER_STATUS_EVENTS` (employee_id), `CATEGORIES` (created_by_employee_id)។ `CUSTOMERS` រំលង ១-ច្រើនជាមួយ `ORDERS` (customer_id)។ `CATEGORIES` អាចមាន `parent_category_id` ចាប់ខ្លួន (១ កម្រិត) ហើយរំលងជាមួយ `PRODUCTS` (category_id)។
*(EMPLOYEES has 1-to-many with ORDERS (cashier_id), SHIFTS, ORDER_PAYMENTS (confirmed_by_employee_id), ORDER_STATUS_EVENTS (employee_id), CATEGORIES (created_by_employee_id). CUSTOMERS has 1-to-many with ORDERS (customer_id). CATEGORIES may have a self-referencing parent_category_id (one level) and relates to PRODUCTS (category_id).)*

**Scene 3 — ផលិតផល និងធាតុបញ្ជាទិញ (០:៤២–១:០៤)**
`PRODUCTS` រំលងជាមួយ `ORDER_ITEMS` (product_id, អាចជា null)។ `ORDERS` រំលងជាមួយ `ORDER_ITEMS` (contains), `ORDER_PAYMENTS` (settled by), `ORDER_STATUS_EVENTS` (history), និង `ORDERS` ខ្លួនឯង (parent_order_id សម្រាប់ corrections)។ `SHIFTS` រំលងជាមួយ `ORDER_PAYMENTS` (shift_id)។
*(PRODUCTS relates to ORDER_ITEMS (product_id, nullable). ORDERS relates to ORDER_ITEMS (contains), ORDER_PAYMENTS (settled by), ORDER_STATUS_EVENTS (history), and to itself (parent_order_id for corrections). SHIFTS relates to ORDER_PAYMENTS (shift_id).)*

**Scene 4 — ជួរសំខាន់នៃ ORDERS និង PRODUCTS (១:០៤–១:២៦)**
ជួរសំខាន់៖ `ORDERS.id` ជា PK មានរូបភាព `CS-n` / `TG-n` / `RF-n`; columns មាន `pickup_code`, `cashier_id`, `customer_id`, `parent_order_id`, `idempotency_key` (UK), `source` (walk-in|telegram), `subtotal_cents`, `total_cents`, `payment` (Cash|KHQR), `status`, `payment_status`, `hold_label`, `detail_json`។ `PRODUCTS` មាន `price_cents`, `stock`, `reserved_stock`, `sold`, `revenue_cents`, `made_at`, `best_before`។
*(Key columns: ORDERS.id is PK with format CS-n / TG-n / RF-n; columns include pickup_code, cashier_id, customer_id, parent_order_id, idempotency_key (UK), source (walk-in|telegram), subtotal_cents, total_cents, payment (Cash|KHQR), status, payment_status, hold_label, detail_json. PRODUCTS has price_cents, stock, reserved_stock, sold, revenue_cents, made_at, best_before.)*

**Scene 5 — ជួរទូទាត់ ប្រវត្តិ និងតារាងក្រៅដេក្រាម (១:២៦–១:៤៨)**
`ORDER_PAYMENTS` មាន `method` (cash|qr_manual), `status` (confirmed|failed), `amount_usd_cents`, `exchange_rate_khr_per_usd`, `tendered_usd_cents`, `tendered_khr`, `change_usd_cents`, `change_khr`, `shift_id`, `confirmed_by_employee_id`, `confirmed_at`, `metadata`។ `ORDER_STATUS_EVENTS` មាន `from_status`, `to_status`, `employee_id`, `metadata`។ មានតារាង ២ ទៀតក្រៅដេក្រាម៖ `order_number_sequences` និង `store_shift_locks` (race-safe, គ្មានទិន្នន័យអាជីវកម្ម)។
*(ORDER_PAYMENTS has method (cash|qr_manual), status (confirmed|failed), amount_usd_cents, exchange_rate_khr_per_usd, tendered_usd_cents, tendered_khr, change_usd_cents, change_khr, shift_id, confirmed_by_employee_id, confirmed_at, metadata. ORDER_STATUS_EVENTS has from_status, to_status, employee_id, metadata. Two more tables off the diagram: order_number_sequences and store_shift_locks (race-safe, hold no business data).)*

**Scene 6 — ឧទាហរណ៍នំខួបកំណើត (១:៤៨–២:០២)**
ឧទាហរណ៍៖ ការបញ្ជាទិញនំខួបកំណើត — `CUSTOMERS` ដាក់ `ORDERS`; `ORDERS` មាន `ORDER_ITEMS` ដែលចង្អុលទៅ `PRODUCTS`; ការទូទាត់ settled ដោយ `ORDER_PAYMENTS` ភ្ជាប់ជាមួយ `SHIFTS` និង `EMPLOYEES`; ប្រវត្តិនៅ `ORDER_STATUS_EVENTS`។ ទំនាក់ទំនងទាំងអស់នេះ មកពី migrations ពិត មិនមែនការសន្មត់ទេ។
*(Example: a birthday cake order — CUSTOMERS places ORDERS; ORDERS has ORDER_ITEMS pointing to PRODUCTS; payment is settled by ORDER_PAYMENTS linked to SHIFTS and EMPLOYEES; history lives in ORDER_STATUS_EVENTS. All these relationships come from real migrations, not guesses.)*

---

## ផែនការរូបភាពតាមឈុត (Scene-by-Scene Visual Plan)

- **ឈុត ១ (០:០០):** បង្ហាញ erDiagram ទាំងមូល (៩ តារាង) ជារូបតូច រួច zoom ចូលតារាងស្នូល។
- **ឈុត ២ (០:១៨):** បង្ហាញព្រួញ `EMPLOYEES ||--o{ ORDERS/CATEGORIES/SHIFTS/ORDER_PAYMENTS/ORDER_STATUS_EVENTS` ជាមួយស្លាក FK (`cashier_id`, `created_by_employee_id`, `confirmed_by_employee_id`, `employee_id`) និង `CUSTOMERS ||--o{ ORDERS` (`customer_id`), `CATEGORIES ||--o{ CATEGORIES` (`parent_category_id`), `CATEGORIES ||--o{ PRODUCTS` (`category_id`)។
- **ឈុត ៣ (០:៤២):** ព្រួញ `PRODUCTS ||--o{ ORDER_ITEMS` (`product_id` nullable), `ORDERS ||--o{ ORDER_ITEMS / ORDER_PAYMENTS / ORDER_STATUS_EVENTS`, `ORDERS ||--o{ ORDERS` (`parent_order_id`), `SHIFTS ||--o{ ORDER_PAYMENTS` (`shift_id`)។
- **ឈុត ៤ (១:០៤):** បង្ហាញប្រអប់ `ORDERS` ជាមួយ columns (id PK `CS-n/TG-n/RF-n`, pickup_code, cashier_id, customer_id, parent_order_id, idempotency_key UK, source, subtotal_cents, total_cents, payment, status, payment_status, hold_label, detail_json) និង `PRODUCTS` (price_cents, stock, reserved_stock, sold, revenue_cents, made_at, best_before)។
- **ឈុត ៥ (១:២៦):** បង្ហាញ `ORDER_PAYMENTS` (method, status, amount_usd_cents, exchange_rate_khr_per_usd, tendered_usd_cents, tendered_khr, change_usd_cents, change_khr, shift_id, confirmed_by_employee_id, confirmed_at, metadata) និង `ORDER_STATUS_EVENTS` (from_status, to_status, employee_id, metadata) រួចបន្ថែម note តារាងក្រៅដេក្រាម `order_number_sequences`, `store_shift_locks`។
- **ឈុត ៦ (១:៤៨):** ឧទាហរណ៍នំខួបកំណើត — រូបភាពអតិថិជន តារាង និងព្រួញរត់ CUSTOMERS → ORDERS → ORDER_ITEMS → PRODUCTS, ORDERS → ORDER_PAYMENTS → SHIFTS/EMPLOYEES, ORDERS → ORDER_STATUS_EVENTS។

**រយៈពេលប៉ាន់ស្មាន:** ~៨៧ វិនាទី (៦ ឈុត, បង្ហាញ table/column ពិត)។
