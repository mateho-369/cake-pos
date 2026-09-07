# System Architecture

Three separate apps — one for shop admins, one for cashiers at the counter, and one for customers on Telegram — all talk to the same backend, which is the only thing that ever touches the database. In production, requests pass through a small Cloudflare proxy that forwards HTTPS traffic to the backend server; locally, the frontends talk to the backend directly.

```mermaid
flowchart LR
    subgraph Frontends["Three frontend apps"]
        Admin["apps/admin\n(Owner/manager dashboard)"]
        Sale["apps/sale\n(Cashier terminal)"]
        Shop["apps/shop\n(Customer Telegram Mini App)"]
    end

    Proxy["apps/api-proxy\n(Cloudflare Worker — HTTPS passthrough)"]

    Backend["Laravel + Sanctum API\nbackend/"]

    DB[("MySQL database")]

    Telegram["Telegram\n(bot messages: staff notifications,\ncustomer order updates)"]

    Admin -->|HTTPS, staff login token| Proxy
    Sale -->|HTTPS, staff login token| Proxy
    Shop -->|HTTPS, Telegram Mini App| Proxy
    Proxy -->|HTTP, forwarded request| Backend
    Backend -->|reads / writes| DB
    Backend -->|sendMessage webhooks| Telegram
    Telegram -->|customer taps / commands| Shop
```
