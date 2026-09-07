# វីដេអូ ៣ — Hold → Resume → Payment Sequence

**ប្រភព Diagram:** `docs/diagrams/sequence-hold-payment.md`
**អ្នកទស្សនា:** ផ្នែកខាងក្នុង / បច្ចេកទេស (បង្ហាញឈ្មោះ API endpoint, table និង column ពិត)
**រយៈពេលប៉ាន់ស្មាន:** ~៨៨ វិនាទី

រូបភាពត្រូវតែឆ្លុះបញ្ចាំងទំរង់ពិតរបស់ sequence diagram៖ ព្រួញសារជំហានម្តងមួយ (cashier → apps/sale → OrderController → OrderService/PaymentService → MySQL)។

---

## ស្គ្រីបនិទាយខ្មែរ (Khmer Narration Script)

**Scene 1 — ណែនាំអ្នកចូលរួម (០:០០–០:១៣)**
វីដេអូនេះសម្រាប់អ្នកបច្ចេកទេស។ យើងតាមដានករណីអ្នកលក់ (cashier) បង្កើត cart បញ្ចាំទុក (hold) រួចយកលុយវិញ។ អ្នកចូលរួម៖ `apps/sale`, `OrderController`, `OrderService`/`PaymentService`, និង MySQL (`products`, `orders`, `order_items`, `order_payments`)។
*(Technical video. We follow a cashier building a cart, parking it as a hold, then taking payment. Participants: apps/sale, OrderController, OrderService/PaymentService, MySQL.)*

**Scene 2 — Cart និង Hold (០:១៣–០:៣២)**
អ្នកលក់បន្ថែមទំនិញក្នុង cart (cart នៅក្នុង browser រហូតដល់បញ្ចាំទុក ឬទូទាត់) ហើយចុច "Hold order"។ `apps/sale` ផ្ញើ `POST /orders/hold` ទៅ `OrderController` ដែលហៅ `OrderService::hold(input, employee)`។
*(The cashier adds items to the cart — the cart lives in the browser until held or paid — and taps "Hold order". apps/sale sends POST /orders/hold to OrderController, which calls OrderService::hold(input, employee).)*

**Scene 3 — Transaction និងការបម្រុងស្តុក (០:៣២–០:៥៨)**
ក្នុង transaction មួយ (BEGIN TRANSACTION … COMMIT) `OrderService` ចាក់ `SELECT … FOR UPDATE` ដើម្បីចាក់សោជួរផលិតផលនីមួយៗ រួច `INSERT orders` (status = Held) ធ្វើ `UPDATE products SET reserved_stock += qty` និង `INSERT order_items`។ ឆ្លើយត្រឡប់ `201 Created` (status: Held)។ ស្តុកដែលបម្រុងទុក លែងឃើញជាស្តុកទំនេរសម្រាប់ terminal ផ្សេង និង `apps/shop`។
*(In one transaction OrderService issues SELECT … FOR UPDATE to lock each product row, then INSERT orders (status = Held), UPDATE products SET reserved_stock += qty, and INSERT order_items. Returns 201 Created (status: Held). The reserved stock becomes invisible as available to other terminals and apps/shop.)*

**Scene 4 — Resume (០:៥៨–១:១៦)**
ពេលក្រោយ អ្នកលក់បើក Held orders៖ `apps/sale` ផ្ញើ `GET /orders/held` ហើយ backend ឆ្លើយបញ្ជីពីចាស់ទៅថ្មី (oldest first)។ ពេលចុចការបញ្ចាំនោះ (Resume) cart ត្រូវបង្កើតឡើងវិញពី line items របស់ការបញ្ជាទិញនោះ។
*(Later the cashier opens Held orders: apps/sale sends GET /orders/held, and the backend returns the list oldest first. Tapping the held order (Resume) rebuilds the cart from its line items.)*

**Scene 5 — Take Payment (១:១៦–១:៤២)**
ពេលចុច Take Payment `apps/sale` ផ្ញើ `POST /orders/:id/pay` (method, tender) ទៅ `PaymentService::confirm(order, method, input, employee)`។ ក្នុង transaction ថ្មី៖ `SELECT order FOR UPDATE`, `INSERT order_payments` (status = confirmed, shift_id), `UPDATE orders SET status = Completed`, `SELECT products FOR UPDATE`, ហើយ `UPDATE products SET stock -= qty, reserved_stock -= qty, sold += qty, revenue_cents += ចំណែករបស់វា`។ ឆ្លើយ `200 OK` (status: Completed)។
*(On Take Payment, apps/sale sends POST /orders/:id/pay (method, tender) to PaymentService::confirm(order, method, input, employee). In a new transaction: SELECT order FOR UPDATE, INSERT order_payments (status = confirmed, shift_id), UPDATE orders SET status = Completed, SELECT products FOR UPDATE, then UPDATE products SET stock -= qty, reserved_stock -= qty, sold += qty, revenue_cents += its share. Returns 200 OK (status: Completed).)*

**Scene 6 — គ្មានជំហានរំសាយដាច់ដោយឡែក + ឧទាហរណ៍ (១:៤២–១:៥៨)**
សំខាន់៖ ការរំសាយការបញ្ចាំ គ្រាន់តែកើតឡើងពេលការបញ្ជាទិញចាកចេញពី Held — គ្មានជំហានរំសាយដាច់ដោយឡែកទេ ដូច្នេះការគាំងកណ្តាលការទូទាត់មិនអាចទុកស្តុកបម្រុងដោយគ្មានការបញ្ជាទិញទេ។ ឧទាហរណ៍៖ អ្នកលក់បញ្ចាំការបញ្ជាទិញនំមួយទុក ខណៈអតិថិជនចេញទៅក្រៅ រួចយកលុយពេលគាត់ត្រឡប់មក។
*(Key: the hold is released simply when the order leaves Held — no separate release step, so a crash mid-payment can never leave stock reserved with no matching order. Example: a cashier holds a cake order while the customer steps out, then takes payment when they return.)*

---

## ផែនការរូបភាពតាមឈុត (Scene-by-Scene Visual Plan)

- **ឈុត ១ (០:០០):** បង្ហាញ sequence diagram header ជាមួយ lifeline ៥៖ Cashier (actor), `apps/sale`, `OrderController` (API), `OrderService`/`PaymentService` (Svc), `MySQL` (`products, orders, order_items, order_payments`)។
- **ឈុត ២ (០:១៣):** ព្រួញ `Cashier → apps/sale` "Add items to cart" (note: cart in browser) និង `Cashier → apps/sale` "Tap Hold order" → `apps/sale → OrderController` `POST /orders/hold` → `OrderController → Svc` `OrderService::hold(input, employee)` (activate Svc)។
- **ឈុត ៣ (០:៣២):** ព្រួញក្នុង Svc៖ `BEGIN TRANSACTION`, `SELECT … FOR UPDATE` (lock product rows), `INSERT orders (status=Held)`, `UPDATE products SET reserved_stock += qty`, `INSERT order_items`, `COMMIT` (deactivate Svc) → `OrderController →→ apps/sale` `201 Created (status: Held)`។ បង្ហាញ note MySQL "Reserved units invisible as available stock"។
- **ឈុត ៤ (០:៥៨):** `Cashier → apps/sale` "open Held orders" → `apps/sale → OrderController` `GET /orders/held` → `→→ apps/sale` "List of Held orders, oldest first" → `Cashier → apps/sale` "Tap held order (Resume)" (note: cart rebuilt from line items)។
- **ឈុត ៥ (១:១៦):** `Cashier → apps/sale` "Tap Take Payment" → `apps/sale → OrderController` `POST /orders/:id/pay` → `OrderController → Svc` `PaymentService::confirm(...)` (activate Svc) → `BEGIN TRANSACTION`, `SELECT order FOR UPDATE`, `INSERT order_payments (status=confirmed, shift_id)`, `UPDATE orders SET status=Completed`, `SELECT products FOR UPDATE`, `UPDATE products SET stock-=qty, reserved_stock-=qty, sold+=qty, revenue_cents+=…`, `COMMIT` → `→→ apps/sale` `200 OK (status: Completed)`។
- **ឈុត ៦ (១:៤២):** បង្ហាញ note "hold រំសាយពេលចាកចេញពី Held — គ្មានជំហានរំសាយដាច់ដោយឡែក" + រូបភាពអ្នកលក់បញ្ចាំនំទុកពេលអតិថិជនចេញទៅក្រៅ។

**រយៈពេលប៉ាន់ស្មាន:** ~៨៨ វិនាទី (៦ ឈុត, មានពាក្យបច្ចេកទេស និង endpoint/column ច្រើន)។
