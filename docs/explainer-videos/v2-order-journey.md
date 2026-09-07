# វីដេអូ ២ — ដំណើរការបញ្ជាទិញ (Order Journey)

**ប្រភព Diagram:** `docs/diagrams/order-journey.md`
**អ្នកទស្សនា:** អតិថិជនទូទៅ (ភាសាធម្មតា)
**រយៈពេលប៉ាន់ស្មាន:** ~៨២ វិនាទី

រូបភាពត្រូវតែឆ្លុះបញ្ចាំងទំរង់ពិតរបស់ state diagram៖ ដើរតាមស្ថានភាពមួយម្តងៗ (Pending → Confirmed/Ready → Held → Completed និង Cancelled) ដោយសរសេរស្លាកថាតើអ្នកណាបង្កើតការផ្លាស់ប្តូរនីមួយៗ។

---

## ស្គ្រីបនិទាយខ្មែរ (Khmer Narration Script)

**Scene 1 — ផ្លូវកំណើត ២ (០:០០–០:១៤)**
តើការបញ្ជាទិញនៅហាងនំដំណើរការយ៉ាងដូចម្តេច? មានផ្លូវ ២ ដែលការបញ្ជាទិញកើតឡើង៖ អតិថិជនបញ្ជាទិញតាម Telegram Mini App ឬអ្នកលក់វាយការលក់អតិថិជនដែលមកហាង។
*(How does an order work? Two ways an order is born: a customer orders via the Telegram Mini App, or a cashier rings up a walk-in sale.)*

**Scene 2 — Pending និងការបញ្ជាក់ (០:១៤–០:៣៤)**
ពេលអតិថិជនបញ្ជាទិញតាម Telegram ការបញ្ជាទិញចូលស្ថានភាព Pending (រង់ចាំ)។ បុគ្គលិកអាចផ្លាស់វាទៅ Confirmed (បានបញ្ជាក់) ឬ Ready (រៀបចំរួច)។ ការផ្លាស់ទាំងនេះធ្វើដោយបុគ្គលិក — អតិថិជនមិនអាចផ្លាស់ដោយខ្លួនឯងបានទេ។
*(When a customer orders via Telegram, it enters Pending. Staff can move it to Confirmed or Ready. These changes are made by staff — the customer can't change them.)*

**Scene 3 — Held (បញ្ចាំទុក) (០:៣៤–០:៥៦)**
ពេលអ្នកលក់ទទួលយកការបញ្ជាទិញ វាចូលស្ថានភាព Held (រង់ចាំទូទាត់) — សម្រាប់អតិថិជនដែលនឹងមកយក និងទូទាត់ពេលក្រោយ។ សម្រាប់អតិថិជនដែលមកហាងផ្ទាល់ អ្នកលក់អាចបញ្ចាំវាទុក (hold) ភ្លាមៗក៏បាន។
*(When staff accepts the order, it enters Held (awaiting payment) — for customers who collect and pay later. For walk-in customers, the cashier can park it as a hold right away.)*

**Scene 4 — Cancelled (០:៥៦–១:១៨)**
ការបញ្ជាទិញអាចបោះបង់ (Cancelled) បាន៖ អតិថិជនអាចបោះបង់ដោយខ្លួនឯង ឬអ្នកលក់អាចបដិសេធ (reject)។ ប៉ុន្តែពេលវាចូល Held ហើយ វាជារបស់បុគ្គលិកទាំងស្រុង — អតិថិជនលែងអាចបោះបង់ដោយខ្លួនឯងបានទេ គ្រាន់តែបុគ្គលិកទេដែលអាចបោះបង់ ឬបញ្ចប់វា។
*(An order can be Cancelled: the customer can cancel themselves, or staff can reject. But once Held, it's fully staff-owned — the customer can no longer self-cancel; only staff can cancel or complete it.)*

**Scene 5 — Completed (១:១៨–១:៣៦)**
នៅចុងបញ្ចប់ ពេលអ្នកលក់យកលុយ ការបញ្ជាទិញចូលស្ថានភាព Completed (រួចរាល់) ហើយប្រព័ន្ធក៏រៀបចំស្តុក និងចំណូល។ ការបញ្ជាទិញដែល Completed ហើយមិនអាចកែបានទៀតទេ — បើមានកំហុស គេជួសជុលដោយកំណត់ត្រាកំណែ មិនមែនកែលើការបញ្ជាទិញនោះផ្ទាល់ទេ។
*(Finally, when staff takes payment, the order enters Completed and the system settles stock and revenue. A Completed order is immutable — mistakes are fixed with a correction record, never by editing the order.)*

**Scene 6 — ឧទាហរណ៍នំខួបកំណើត (១:៣៦–១:៥២)**
ឧទាហរណ៍៖ អតិថិជនបញ្ជាទិញនំខួបកំណើតតាម Telegram (Pending) ម្ចាស់ហាងបញ្ជាក់ (Confirmed) រៀបចំរួច (Ready) ទទួលយក (Held) ហើយពេលអតិថិជនមកយក ក៏ទូទាត់ → Completed។ សាមញ្ញ និងច្បាស់លាស់!
*(Example: a customer orders a birthday cake via Telegram (Pending); the owner confirms (Confirmed), preps it (Ready), accepts (Held), and when the customer collects, pays → Completed. Simple and clear!)*

---

## ផែនការរូបភាពតាមឈុត (Scene-by-Scene Visual Plan)

- **ឈុត ១ (០:០០):** បង្ហាញ state diagram ទាំងមូលជារូបតូច រួច zoom ចូលស្ថានភាព `[*]` និងព្រួញ `→ Pending` ស្លាក "Customer places a Telegram order — POST /customer-orders" និង `→ Held` ស្លាក "Cashier holds a walk-in cart — POST /orders/hold"។
- **ឈុត ២ (០:១៤):** ព្រួញពី Pending → Confirmed និង Pending → Ready ស្លាក "Staff edits status — PATCH /orders/:id, admin only" (ស្លាក "Staff action")។
- **ឈុត ៣ (០:៣៤):** ព្រួញ Pending/Confirmed/Ready → Held ស្លាក "Staff accepts the order — POST /orders/:id/accept" រួចបង្ហាញ note ខាងស្តាំនៃ Pending៖ "ពេលដល់ Held វាជារបស់បុគ្គលិក — អតិថិជនលែងអាចបោះបង់ដោយខ្លួនឯង"។
- **ឈុត ៤ (០:៥៦):** ព្រួញ Pending/Confirmed/Ready → Cancelled ស្លាក "Customer cancels — POST /customer-orders/:id/cancel ឬ Staff rejects — POST /orders/:id/reject" និង Held → Cancelled ស្លាក "Staff cancels the held order — POST /orders/:id/cancel"។
- **ឈុត ៥ (១:១៨):** ព្រួញ Held → Completed ស្លាក "Staff takes payment — POST /orders/:id/pay; System settles stock and revenue" រួចបង្ហាញ note ខាងស្តាំនៃ Completed៖ "Completed orders are immutable" និងព្រួញ Completed/Cancelled → `[*]`។
- **ឈុត ៦ (១:៣៦):** ឧទាហរណ៍នំខួបកំណើត — រូបភាពអតិថិជនក្នុង Telegram រួចព្រួញរត់ Pending → Confirmed → Ready → Held → Completed ជាអនុក្រមមួយជុំ ជាមួយស្លាកអ្នកបង្កើតនីមួយៗ។

**រយៈពេលប៉ាន់ស្មាន:** ~៨២ វិនាទី (៦ ឈុត, និទាយធម្មតា)។
