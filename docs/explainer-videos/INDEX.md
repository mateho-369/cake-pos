# Cake POS — ៥ វីដេអូពន្យល់អំពី Diagram (Explainer Videos)

ឯកសារនេះមានវីដេអូពន្យល់ ៥ ផ្តោតលើ Diagram នីមួយៗដែលបានចុះក្នុង `docs/diagrams/` នៃ repo `mateho-369/cake-pos`។
រៀងរាប់ពី Diagram មួយទៅមួយ មិនមានការរួមបញ្ចូល Diagram ២ ក្នុងវីដេអូតែមួយទេ។

| # | ឯកសារ Diagram | វីដេអូ | អ្នកទស្សនា | រយៈពេលប៉ាន់ស្មាន |
|---|---|---|---|---|
| 1 | `system-architecture.md` | ស្ថាបត្យកម្មប្រព័ន្ធ | អតិថិជនទូទៅ (មិនមែនបច្ចេកទេស) | ~៨៥ វិនាទី |
| 2 | `order-journey.md` | ដំណើរការបញ្ជាទិញ | អតិថិជនទូទៅ | ~៨២ វិនាទី |
| 3 | `sequence-hold-payment.md` | Hold → Resume → Payment | ផ្នែកខាងក្នុង / បច្ចេកទេស | ~៨៨ វិនាទី |
| 4 | `sequence-cancel-race.md` | ការប្រកួត Cancel ពីរទ្វារ | ផ្នែកខាងក្នុង / បច្ចេកទេស | ~៨៦ វិនាទី |
| 5 | `erd.md` | ERD (ទំរង់មូលដ្ឋានទិន្នន័យ) | ផ្នែកខាងក្នុង / បច្ចេកទេស | ~៨៧ វិនាទី |

ភាសានិទាយ៖ **ខ្មែរ** (ពាក្យបច្ចេកទេស ដូចជា API, database, Sanctum, ឈ្មោះ table/column, HTTP methods នៅជាភាសាអង់គ្លេស)។
រាល់ការពិតក្នុងនិទាយ តាមដានត្រឡប់ពី Diagram ឬពីកូដពិតនៃ repo (កូដក្រោយកែជម្រះ និង Diagram ដែលបាន commit)។

ឯកសារក្នុងថតនេះ៖
- `v1-system-architecture.md`
- `v2-order-journey.md`
- `v3-sequence-hold-payment.md`
- `v4-sequence-cancel-race.md`
- `v5-erd.md`

## ការបញ្ជាក់នៅចុងបញ្ចប់ (Confirmation)

វីដេអូទាំង ៥ ត្រូវបានសង់ឡើងពីមាតិកាពិតរបស់ repo — **មិនមែនពីការប៉ាន់ស្មានទេ**៖
- ប្រភព Diagram គឺឯកសារ ៥ ដែលបាន commit ក្នុង `docs/diagrams/` (system-architecture, order-journey, sequence-hold-payment, sequence-cancel-race, erd)។
- ប្រភពកូដពិត៖ `apps/api-proxy/index.js` (Cloudflare Worker), `backend/routes/api.php` (endpoints), `backend/app/Http/Controllers/OrderController.php`, `backend/app/Services/OrderService.php` (`hold`/`holdInTransaction`), `backend/app/Services/PaymentService.php` (`confirm`/`confirmCash`/`confirmManualQr`), `backend/app/Services/CustomerOrderService.php` (`cancel`/`rejectByStaff` ជាមួយ 409), និង migrations (`products.reserved_stock`, `orders.pickup_code`/`hold_label`/`parent_order_id`, `categories.parent_category_id`/`pending_review`/`created_by_employee_id`, `order_payments`, `order_status_events`)។
- បរិបទអាជីវកម្ម (ហាងនំ/នំខ្មុំ ជាមួយ Telegram Mini App សម្រាប់អតិថិជន) យកពី `README.md` និង `docs/TELEGRAM_STOREFRONT.md`។

គ្មានពេលវេលាណាដែលបានប្រឌិតព័ត៌មានដែល repo មិនគាំទ្រទេ។
