# វីដេអូ ៤ — The Two-Door Cancel Race

**ប្រភព Diagram:** `docs/diagrams/sequence-cancel-race.md`
**អ្នកទស្សនា:** ផ្នែកខាងក្នុង / បច្ចេកទេស (បង្ហាញ endpoint, row lock, 409)
**រយៈពេលប៉ាន់ស្មាន:** ~៨៦ វិនាទី

រូបភាពត្រូវតែឆ្លុះបញ្ចាំងទំរង់ពិតរបស់ sequence diagram ដែលមាន `par` (សំណើរ ២ ប្រកួតគ្នា) និងព្រួញបង្ហាញថាតើ row lock ជ្រើសអ្នកណាជាអ្នកឈ្នះ។

---

## ស្គ្រីបនិទាយខ្មែរ (Khmer Narration Script)

**Scene 1 — ទ្វារ ២ នៃការបោះបង់ (០:០០–០:១៤)**
វីដេអូនេះសម្រាប់អ្នកបច្ចេកទេស។ ការបញ្ជាទិញ Telegram ដែលមិនទាន់ទទួលយក អាចបោះបង់បានពីទ្វារ ២ ផ្សេងគ្នា៖ អតិថិជនចុច "Cancel" ក្នុង Mini App និងអ្នកលក់ចុច "Reject" ក្នុង terminal បន្ទាប់ពីហៅទូរស័ព្ទអតិថិជន។
*(Technical video. A not-yet-accepted Telegram order can be cancelled from two doors: the customer taps "Cancel" in the Mini App, and a cashier taps "Reject" in the terminal after calling the customer.)*

**Scene 2 — សំណើរ par ២ មកដល់ជាប់ៗគ្នា (០:១៤–០:៣៨)**
សំណើរទាំង ២ មកដល់ជាប់ៗគ្នា (par)៖ `apps/shop` ផ្ញើ `POST /customer-orders/:id/cancel` → `TelegramController::cancelOrder` → `CustomerOrderService.cancel(customer, order)`។ ក្នុងពេលជាមួយគ្នា `apps/sale` ផ្ញើ `POST /orders/:id/reject` → `OrderController::reject` → `CustomerOrderService.rejectByStaff(order, employee, reason)`។
*(The two requests arrive nearly simultaneously (par): Shop sends POST /customer-orders/:id/cancel → TelegramController::cancelOrder → CustomerOrderService.cancel(customer, order). Meanwhile Sale sends POST /orders/:id/reject → OrderController::reject → CustomerOrderService.rejectByStaff(order, employee, reason).)*

**Scene 3 — Row lock ជ្រើសអ្នកឈ្នះ (០:៣៨–១:០២)**
ទាំង ២ ចាក់សោជួរ order ដូចគ្នា (`SELECT … FOR UPDATE`) ហើយពិនិត្យស្ថានភាពឡើងវិញបន្ទាប់ពីបានសោនោះ។ MySQL ជាអ្នកសម្រេចថាតើអ្នកណាមកដល់មុន — ត្រង់នេះ សូមឲ្យអតិថិជនមុន។ សំណើររបស់អ្នកលក់ត្រូវរារាំង (BLOCK) រង់ចាំសោ។
*(Both lock the same order row (SELECT … FOR UPDATE) and re-check status only after acquiring the lock. MySQL decides who arrives first — say the customer. The cashier's request is blocked, waiting for the lock.)*

**Scene 4 — អតិថិជនឈ្នះ (១:០២–១:២៤)**
ផ្លូវអតិថិជន៖ ស្ថានភាពនៅតែ `Pending/Confirmed/Ready` → អនុញ្ញាត។ រំសាយស្តុកបម្រុង (release reserved stock) ធ្វើ `UPDATE orders SET status = Cancelled` ហើយ `COMMIT`។ សោត្រូវរំសាយ សំណើរអ្នកលក់ដែលរារាំង ឥឡូវអានជួរឡើងវិញ។
*(Customer path: status still Pending/Confirmed/Ready → OK. Release reserved stock, UPDATE orders SET status = Cancelled, COMMIT. The lock is released; the cashier's blocked request now re-reads the row.)*

**Scene 5 — អ្នកលក់ចាញ់ ទទួល 409 (១:២៤–១:៤៦)**
ផ្លូវអ្នកលក់៖ អានឡើងវិញ ឃើញស្ថានភាពឥឡូវជា `Cancelled` ការពិនិត្យ rejectable បរាជ័យ។ បញ្ចូល `HttpResponseException (409)` — API ឆ្លើយត្រឡប់ `409` ថា "already cancelled by the customer"។ terminal បង្ហាញការពន្យល់ច្បាស់លាស់ មិនមែនការគាំង។ អតិថិជនទទួល `200 OK` "order Cancelled"។
*(Staff path: re-reads, sees status is now Cancelled, the rejectable check fails. Throws HttpResponseException (409) — the API returns 409 saying "already cancelled by the customer". The terminal shows a clean explanation, not a crash. The customer receives 200 OK "order Cancelled".)*

**Scene 6 — ស្ថានភាពស្មើគ្នា + ឧទាហរណ៍ (១:៤៦–២:០២)**
បើសំណើរអ្នកលក់មកដល់មុន លទ្ធផលដូចគ្នា — អតិថិជនជាអ្នកទទួល `409`។ ឧទាហរណ៍៖ អតិថិជនបោះបង់ការបញ្ជាទិញនំក្នុង Mini App ពេលជាមួយគ្នាដែលអ្នកលក់ (ដែលហៅទូរស័ព្ទរួចដឹងថាវាជាកំហុស) ចុច Reject — MySQL row lock ជ្រើសអ្នកឈ្នះ ហើយអ្នកចាញ់ទទួល `409` ស្អាត។
*(If the staff request arrives first, the outcome is symmetric — the customer is the one who gets 409. Example: a customer cancels a cake order in the Mini App at the same moment the cashier (who called and learned it was a mistake) taps Reject — MySQL's row lock picks the winner, and the loser gets a clean 409.)*

---

## ផែនការរូបភាពតាមឈុត (Scene-by-Scene Visual Plan)

- **ឈុត ១ (០:០០):** បង្ហាញ sequence diagram ជាមួយ actor ២ (Customer, Cashier), `apps/shop`, `apps/sale`, `TelegramController::cancelOrder` (API_C), `OrderController::reject` (API_S), `CustomerOrderService` (Svc), `MySQL` (`orders, order_items, products`)។
- **ឈុត ២ (០:១៤):** បង្ហាញ `par` block ២ ជាស្រប៖ ផ្នែកអតិថិជន `Customer → apps/shop` "Tap Cancel order" → `POST /customer-orders/:id/cancel` → `cancel(customer, order)`; ផ្នែកអ្នកលក់ `Cashier → apps/sale` "Tap Reject" → `POST /orders/:id/reject` → `rejectByStaff(order, employee, reason)`។
- **ឈុត ៣ (០:៣៨):** `Svc → DB` `[customer path] BEGIN, SELECT order FOR UPDATE` (note: row lock របស់អតិថិជន) និង `Svc → DB` `[staff path] BEGIN, SELECT order FOR UPDATE` (note: staff BLOCKS រង់ចាំសោ)។
- **ឈុត ៤ (១:០២):** `[customer path]` ពិនិត្យ status OK → release reserved stock → `UPDATE orders SET status = Cancelled` → `COMMIT` (note: lock រំសាយ, staff អានឡើងវិញ)។
- **ឈុត ៥ (១:២៤):** `[staff path]` re-read status = Cancelled → rejectable check fails → `Svc →→ API_S` `throw HttpResponseException (409)` → `API_S →→ Sale` `409 message` → `Sale →→ Cashier` "clean explanation"។ ផ្ទុយគ្នា `API_C →→ Shop` `200 OK` → `Shop →→ Customer` "order Cancelled"។
- **ឈុត ៦ (១:៤៦):** បង្ហាញ note "symmetric បើ staff មកមុន" + រូបភាពអតិថិជន និងអ្នកលក់ចុចតែមួយជាមួយលើការបញ្ជាទិញនំដូចគ្នា ហើយ MySQL row lock បង្ហាញសញ្ញាឈ្នះ/ចាញ់។

**រយៈពេលប៉ាន់ស្មាន:** ~៨៦ វិនាទី (៦ ឈុត, ផ្តោតលើ concurrency និង row lock)។
