# វីដេអូ ១ — ស្ថាបត្យកម្មប្រព័ន្ធ (System Architecture)

**ប្រភព Diagram:** `docs/diagrams/system-architecture.md`
**អ្នកទស្សនា:** អតិថិជនទូទៅ (ភាសាធម្មតា គ្មានព័ត៌មានកម្រិតកូដ)
**រយៈពេលប៉ាន់ស្មាន:** ~៨៥ វិនាទី

រូបភាពត្រូវតែឆ្លុះបញ្ចាំងទំរង់ពិតរបស់ flowchart៖ ៣ កម្មវិធី frontend → proxy → backend → database (និង Telegram)។

---

## ស្គ្រីបនិទាយខ្មែរ (Khmer Narration Script)

**Scene 1 — បើកបទ (០:០០–០:១២)**
ស្វាគមន៍! ថ្ងៃនេះយើងនឹងមើលថាតើកម្មវិធី Cake POS ធ្វើការយ៉ាងដូចម្តេច។ ហាងនំមួយអាចមានអតិថិជន អ្នកលក់ និងម្ចាស់ហាង ប្រើប្រព័ន្ធនេះទាំងអស់គ្នា។
*(Welcome! Today we look at how Cake POS works. A cake shop can have customers, cashiers, and the owner all using this system together.)*

**Scene 2 — ៣ កម្មវិធី frontend (០:១២–០:៣២)**
មានកម្មវិធីផ្នែកខាងមុខ ៣ យ៉ាង៖ ទី១ `apps/admin` ជាផ្ទាំងរបស់ម្ចាស់ហាង ឬអ្នកគ្រប់គ្រង។ ទី២ `apps/sale` ជាផ្ទាំងរបស់អ្នកគិតលុយនៅកន្លែងលក់។ ទី៣ `apps/shop` ជាកម្មវិធី Telegram Mini App របស់អតិថិជន។
*(There are 3 frontend apps: apps/admin is the owner/manager dashboard; apps/sale is the cashier terminal; apps/shop is the customer's Telegram Mini App.)*

**Scene 3 — ម៉ាស៊ីនមេ និង proxy (០:៣២–០:៥៤)**
កម្មវិធីទាំង ៣ នេះ ផ្ញើសំណើរ (request) ទៅកាន់ម៉ាស៊ីនមេតែមួយ គឺ backend ដែលសរសេរជា Laravel និង Sanctum API។ នៅពេលដំណើរការជាក់ស្តែង សំណើរឆ្លងកាត់ Cloudflare Worker មួយ ដែលហៅថា `apps/api-proxy` មុនពេលទៅដល់ backend។
*(These 3 apps send requests to one backend written as Laravel + Sanctum API. In production, requests pass through a Cloudflare Worker called apps/api-proxy before reaching the backend.)*

**Scene 4 — មូលដ្ឋានទិន្នន័យ (០:៥៤–១:១២)**
backend គឺជាផ្នែកតែមួយគត់ដែលប៉ះពាល់មូលដ្ឋានទិន្នន័យ MySQL database។ វាអាន និងសរសេរទិន្នន័យនៅទីនោះ — កម្មវិធីខាងមុខពីរទៅមិនប៉ះផ្ទាល់ទេ។
*(The backend is the only part that touches the MySQL database. It reads and writes data there — the frontend apps never touch it directly.)*

**Scene 5 — Telegram (១:១២–១:៣០)**
ហើយ backend ក៏ផ្ញើសារតាម Telegram ផងដែរ — ដូចជាការជូនដំណឹងដល់បុគ្គលិក និងអាប់ដេតស្ថានភាពការបញ្ជាទិញរបស់អតិថិជន។ អតិថិជនអាចចុច ឬវាយពាក្យបញ្ជានៅក្នុង Telegram ដើម្បីប្រាប់ `apps/shop` ផងដែរ។
*(And the backend also sends messages via Telegram — staff notifications and customer order-status updates. Customers can tap or type commands in Telegram to tell apps/shop.)*

**Scene 6 — ឧទាហរណ៍ហាងនំ (១:៣០–១:៤៥)**
ឧទាហរណ៍៖ អតិថិជនម្នាក់បើក bot របស់ហាងនំក្នុង Telegram មើលនំខ្មុំ ហើយចុចបញ្ជាទិញ — សំណើរនោះដើរតាមផ្លូវដូចគ្នានេះឯង៖ `apps/shop` → proxy → backend → database។ វាសាមញ្ញ សុវត្ថិភាព និងដូចគ្នាសម្រាប់អ្នកទាំងអស់គ្នា។
*(Example: a customer opens the cake shop's bot in Telegram, browses a cake, and taps order — that request travels the very same path: apps/shop → proxy → backend → database. It's simple, safe, and the same for everyone.)*

---

## ផែនការរូបភាពតាមឈុត (Scene-by-Scene Visual Plan)

- **ឈុត ១ (០:០០):** រូបតំណាងហាងនំ + ចំណងជើង "Cake POS — ប្រព័ន្ធរបស់ហាងនំរបស់អ្នក"។ បង្ហាញតួអង្គ ៣៖ អតិថិជន, អ្នកលក់, ម្ចាស់ហាង។
- **ឈុត ២ (០:១២):** បង្ហាញ subgraph "Three frontend apps" ជាប្រអប់ ៣៖ `apps/admin` (Owner/manager dashboard), `apps/sale` (Cashier terminal), `apps/shop` (Customer Telegram Mini App) — ស្របនឹង flowchart។
- **ឈុត ៣ (០:៣២):** បង្ហាញព្រួញ ពីប្រអប់ both ទៅ `apps/api-proxy` (Cloudfl�រស្លាក "HTTPS, staff login token" និង "HTTPS, Telegram Mini App") រួចព្រួញ `apps/api-proxy` → `Laravel + Sanctum API` (backend) ស្លាក "HTTP, forwarded request"។
- **ឈុត ៤ (០:៥៤):** បង្ហាញព្រួញ `Backend` → `MySQL database` ស្លាក "reads / writes" — រួចបន្ទាត់ព័ទ្ធថា "តែមួយគត់ដែលប៉ះ database"។
- **ឈុត ៥ (១:១២):** បង្ហាញថំណើរ `Backend` → `Telegram` (ស្លាក "sendMessage webhooks") និង `Telegram` → `apps/shop` (ស្លាក "customer taps / commands")។
- **ឈុត ៦ (១:៣០):** ឧទាហរណ៍ហាងនំ — រូបភាពអតិថិជនចុចក្នុង Telegram ហើយព្រួញឆ្លងកាត់ `apps/shop` → proxy → backend → database រត់ជាអនុក្រម (animated) មួយជុំ។

**រយៈពេលប៉ាន់ស្មាន:** ~៨៥ វិនាទី (៦ ឈុត, និទាយធម្មតា គ្មានពាក្យបច្ចេកទេសច្រើន)។
