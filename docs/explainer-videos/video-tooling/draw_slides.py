#!/usr/bin/env python3
"""Draw explainer-video scene slides for Videos 2-5 with Pillow.

Khmer TTS and image-generation are unavailable in this sandbox, and there is
no Khmer font installed, so scene diagrams are drawn with English/technical
labels (matching the real diagram files). The Khmer narration is delivered as
sidecar .srt files instead of burned-in captions.
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 720
BG = (255, 255, 255)
BOX = (255, 224, 234)
BOXD = (190, 24, 93)
INK = (45, 45, 45)
LINE = (90, 90, 90)
SOFT = (245, 245, 248)
ACCENT = (40, 120, 160)

_FD = "/usr/share/fonts/truetype/dejavu"
_REG = ImageFont.truetype(f"{_FD}/DejaVuSans.ttf", 22)
_BOLD = ImageFont.truetype(f"{_FD}/DejaVuSans-Bold.ttf", 22)
_TITLE = ImageFont.truetype(f"{_FD}/DejaVuSans-Bold.ttf", 30)


def _wrap(d, text, f, maxw):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= maxw:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _box(d, x, y, w, h, title, sub=None, fill=BOX, outline=BOXD):
    d.rounded_rectangle([x, y, x + w, y + h], radius=14, fill=fill, outline=outline, width=3)
    tl = _wrap(d, title, _BOLD, w - 16)
    ty = y + 12
    for ln in tl:
        d.text((x + w / 2, ty), ln, font=_BOLD, fill=INK, anchor="mm")
        ty += 26
    if sub:
        sl = _wrap(d, sub, _REG, w - 16)
        for ln in sl:
            d.text((x + w / 2, ty), ln, font=_REG, fill=INK, anchor="mm")
            ty += 22


def _arrow(d, x1, y1, x2, y2, label=None, color=LINE, curve=False):
    if curve:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2 - 40
        d.line([(x1, y1), (mx, my), (x2, y2)], fill=color, width=3, joint="curve")
        ex, ey = x2, y2
    else:
        d.line([(x1, y1), (x2, y2)], fill=color, width=3)
        ex, ey = x2, y2
    ang = math.atan2(ey - (my if curve else y1), ex - (mx if curve else x1))
    for da in (math.radians(150), math.radians(210)):
        hx = ex + 12 * math.cos(ang + da)
        hy = ey + 12 * math.sin(ang + da)
        d.line([(ex, ey), (hx, hy)], fill=color, width=3)
    if label:
        lx = (x1 + x2) / 2
        ly = (y1 + y2) / 2 - (50 if curve else 14)
        d.rectangle([lx - d.textlength(label, font=_REG) / 2 - 6, ly - 14,
                     lx + d.textlength(label, font=_REG) / 2 + 6, ly + 16], fill=BG)
        d.text((lx, ly), label, font=_REG, fill=color, anchor="mm")


def _title_bar(d, text):
    d.text((W / 2, 40), text, font=_TITLE, fill=BOXD, anchor="mm")


def scene_state(title, nodes, edges):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    _title_bar(d, title)
    for n in nodes:
        _box(d, n["x"], n["y"], n["w"], n["h"], n["label"], n.get("sub"))
    for e in edges:
        a = next(n for n in nodes if n["id"] == e["from"])
        b = next(n for n in nodes if n["id"] == e["to"])
        sx = a["x"] + a["w"] / 2
        sy = a["y"] + a["h"] / 2
        ex = b["x"] + b["w"] / 2
        ey = b["y"] + b["h"] / 2
        _arrow(d, sx, sy, ex, ey, e.get("label"), curve=e.get("curve", False))
    return img


def scene_seq(title, parts, messages):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    _title_bar(d, title)
    n = len(parts)
    xs = [200 + i * (W - 320) / (n - 1) for i in range(n)]
    top = 110
    for i, p in enumerate(parts):
        d.line([(xs[i], top), (xs[i], H - 60)], fill=LINE, width=2)
        _box(d, xs[i] - 95, top - 50, 190, 44, p)
    y = top + 60
    for m in messages:
        frm, to, lab = m["from"], m["to"], m["label"]
        x1, x2 = xs[frm], xs[to]
        d.line([(x1, y), (x2, y)], fill=ACCENT, width=3)
        ang = 0.0 if x2 >= x1 else 3.14159
        for da in (math.radians(150), math.radians(210)):
            hx = x2 + 12 * math.cos(ang + da)
            hy = y + 12 * math.sin(ang + da)
            d.line([(x2, y), (hx, hy)], fill=ACCENT, width=3)
        d.rectangle([(x1 + x2) / 2 - d.textlength(lab, font=_REG) / 2 - 6, y - 14,
                     (x1 + x2) / 2 + d.textlength(lab, font=_REG) / 2 + 6, y + 16], fill=BG)
        d.text(((x1 + x2) / 2, y), lab, font=_REG, fill=ACCENT, anchor="mm")
        y += 78
    return img


def scene_erd(title, tables, rels):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    _title_bar(d, title)
    positions = {}
    cols = 3
    for i, t in enumerate(tables):
        r, c = divmod(i, cols)
        x = 40 + c * 410
        y = 110 + r * 200
        positions[t["id"]] = (x, y)
        _box(d, x, y, 360, 30 + 18 * len(t["cols"]), t["name"], sub=None, fill=SOFT, outline=ACCENT)
        cy = y + 34
        for col in t["cols"]:
            d.text((x + 14, cy), col, font=_REG, fill=INK)
            cy += 18
    present = set(t["id"] for t in tables)
    for rel in rels:
        if rel["from"] not in present or rel["to"] not in present:
            continue
        a = positions[rel["from"]]
        b = positions[rel["to"]]
        ax = a[0] + 360
        ay = a[1] + 40
        bx = b[0]
        by = b[1] + 40
        _arrow(d, ax, ay, bx, by, rel.get("label"), color=ACCENT, curve=True)
    return img


def scene_title(title, sub, art):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((W / 2, 220), title, font=_TITLE, fill=BOXD, anchor="mm")
    if sub:
        for i, ln in enumerate(_wrap(d, sub, _REG, W - 200)):
            d.text((W / 2, 300 + i * 30), ln, font=_REG, fill=INK, anchor="mm")
    if art:
        d.text((W / 2, 560), art, font=_BOLD, fill=ACCENT, anchor="mm")
    return img


# ---- Video 2: Order Journey (state) ----
def v2_scenes():
    s = []
    s.append(scene_title("Order Journey",
            "Two ways an order is born: a customer orders via the Telegram Mini App, or a cashier rings up a walk-in sale. Khmer narration is in the sidecar .srt file.",
            "Diagram: docs/diagrams/order-journey.md"))
    s.append(scene_state("Pending and staff confirmation",
        [{"id": "p", "x": 120, "y": 250, "w": 240, "h": 80, "label": "Pending", "sub": "customer Telegram order"},
         {"id": "c", "x": 520, "y": 160, "w": 240, "h": 80, "label": "Confirmed", "sub": "admin only"},
         {"id": "r", "x": 520, "y": 340, "w": 240, "h": 80, "label": "Ready", "sub": "admin only"}],
        [{"from": "p", "to": "c", "label": "PATCH /orders/:id"},
         {"from": "p", "to": "r", "label": "PATCH /orders/:id"}]))
    s.append(scene_state("Held - staff accepts or walk-in hold",
        [{"id": "p", "x": 60, "y": 170, "w": 200, "h": 60, "label": "Pending"},
         {"id": "c", "x": 60, "y": 250, "w": 200, "h": 60, "label": "Confirmed"},
         {"id": "r", "x": 60, "y": 330, "w": 200, "h": 60, "label": "Ready"},
         {"id": "w", "x": 60, "y": 470, "w": 200, "h": 60, "label": "Walk-in cart"},
         {"id": "h", "x": 520, "y": 320, "w": 240, "h": 90, "label": "Held", "sub": "staff-owned once Held"}],
        [{"from": "p", "to": "h", "label": "POST /orders/:id/accept"},
         {"from": "c", "to": "h", "label": "accept"},
         {"from": "r", "to": "h", "label": "accept"},
         {"from": "w", "to": "h", "label": "POST /orders/hold (walk-in)"}]))
    s.append(scene_state("Cancelled",
        [{"id": "p", "x": 40, "y": 160, "w": 170, "h": 60, "label": "Pending"},
         {"id": "c", "x": 40, "y": 250, "w": 170, "h": 60, "label": "Confirmed"},
         {"id": "r", "x": 40, "y": 340, "w": 170, "h": 60, "label": "Ready"},
         {"id": "h", "x": 40, "y": 430, "w": 170, "h": 60, "label": "Held"},
         {"id": "x", "x": 620, "y": 300, "w": 300, "h": 90, "label": "Cancelled", "sub": "POST /customer-orders/:id/cancel OR POST /orders/:id/reject"}],
        [{"from": "p", "to": "x", "label": "cancel / reject"},
         {"from": "c", "to": "x", "label": "cancel / reject"},
         {"from": "r", "to": "x", "label": "cancel / reject"},
         {"from": "h", "to": "x", "label": "POST /orders/:id/cancel"}]))
    s.append(scene_state("Completed - system settles",
        [{"id": "h", "x": 120, "y": 200, "w": 240, "h": 90, "label": "Held", "sub": "awaiting payment"},
         {"id": "o", "x": 560, "y": 180, "w": 300, "h": 110, "label": "Completed", "sub": "POST /orders/:id/pay; System settles stock + revenue; immutable"}],
        [{"from": "h", "to": "o", "label": "take payment"}]))
    s.append(scene_title("Cake shop example",
            "Customer orders a birthday cake via Telegram (Pending) then owner confirms (Confirmed), preps (Ready), accepts (Held), and pays on pickup (Completed).",
            "Pending to Confirmed to Ready to Held to Completed"))
    return s


# ---- Video 3: Hold -> Payment (sequence) ----
def v3_scenes():
    s = []
    parts = ["Cashier", "apps/sale", "OrderController", "OrderService", "MySQL"]
    s.append(scene_seq("Hold -> Resume -> Payment (participants)",
        parts, [{"from": 0, "to": 1, "label": "Add items to cart"},
                {"from": 0, "to": 1, "label": "Tap Hold order"}]))
    s.append(scene_seq("Hold order",
        parts, [{"from": 1, "to": 2, "label": "POST /orders/hold"},
                {"from": 2, "to": 3, "label": "OrderService::hold(input, employee)"}]))
    s.append(scene_seq("Transaction reserves stock",
        parts, [{"from": 3, "to": 4, "label": "BEGIN TRANSACTION"},
                {"from": 3, "to": 4, "label": "SELECT ... FOR UPDATE"},
                {"from": 3, "to": 4, "label": "INSERT orders (status=Held)"},
                {"from": 3, "to": 4, "label": "UPDATE products reserved_stock += qty"},
                {"from": 3, "to": 4, "label": "INSERT order_items"},
                {"from": 3, "to": 4, "label": "COMMIT -> 201 Created"}]))
    s.append(scene_seq("Resume held order",
        parts, [{"from": 1, "to": 2, "label": "GET /orders/held -> oldest first"},
                {"from": 0, "to": 1, "label": "Tap held order (Resume)"}]))
    s.append(scene_seq("Take payment",
        parts, [{"from": 1, "to": 2, "label": "POST /orders/:id/pay (method,tender)"},
                {"from": 2, "to": 3, "label": "PaymentService::confirm(...)"},
                {"from": 3, "to": 4, "label": "INSERT order_payments(confirmed,shift_id)"},
                {"from": 3, "to": 4, "label": "UPDATE orders=Completed; UPDATE products"},
                {"from": 3, "to": 4, "label": "COMMIT -> 200 OK"}]))
    s.append(scene_title("Cake shop example",
            "A cashier holds a cake order while the customer steps out, then takes payment when they return. The hold is released simply when the order leaves Held.",
            "no separate release step"))
    return s


# ---- Video 4: Cancel race (sequence) ----
def v4_scenes():
    s = []
    lanes = ["Customer", "apps/shop", "Cashier", "apps/sale", "Service", "MySQL"]
    s.append(scene_title("The Two-Door Cancel Race",
            "A not-yet-accepted Telegram order can be cancelled from two doors at once: customer Cancel, or staff Reject. MySQL row lock picks the winner. Khmer narration is in the sidecar .srt file.",
            "Diagram: docs/diagrams/sequence-cancel-race.md"))
    s.append(scene_seq("Two requests arrive together (par)",
        lanes, [{"from": 0, "to": 1, "label": "Tap Cancel order"},
                {"from": 1, "to": 4, "label": "POST /customer-orders/:id/cancel"},
                {"from": 2, "to": 3, "label": "Tap Reject"},
                {"from": 3, "to": 4, "label": "POST /orders/:id/reject"}]))
    s.append(scene_seq("Both lock the same row",
        lanes, [{"from": 4, "to": 5, "label": "SELECT ... FOR UPDATE (customer)"},
                {"from": 4, "to": 5, "label": "SELECT ... FOR UPDATE (staff BLOCKS)"}]))
    s.append(scene_seq("Customer path wins",
        lanes, [{"from": 4, "to": 5, "label": "status Pending/Confirmed/Ready OK"},
                {"from": 4, "to": 5, "label": "release reserved stock"},
                {"from": 4, "to": 5, "label": "UPDATE orders= Cancelled; COMMIT"}]))
    s.append(scene_seq("Staff path loses -> 409",
        lanes, [{"from": 4, "to": 5, "label": "re-read: Cancelled -> rejectable fails"},
                {"from": 4, "to": 2, "label": "throw HttpResponseException 409"},
                {"from": 1, "to": 0, "label": "200 OK order Cancelled"}]))
    s.append(scene_title("Cake shop example",
            "A customer cancels a cake order in the Mini App at the same moment the cashier (who called and learned it was a mistake) taps Reject. MySQL row lock picks the winner; the loser gets a clean 409.",
            "symmetric if staff arrives first"))
    return s


# ---- Video 5: ERD ----
def v5_scenes():
    s = []
    full = [
        {"id": "emp", "name": "EMPLOYEES", "cols": ["id PK", "name", "email", "role admin|cashier", "pin_hash", "active"]},
        {"id": "cus", "name": "CUSTOMERS", "cols": ["id PK", "telegram_user_id UK", "name", "phone", "first_seen_at"]},
        {"id": "cat", "name": "CATEGORIES", "cols": ["id PK", "parent_category_id FK", "name UK", "pending_review", "created_by_employee_id"]},
        {"id": "pro", "name": "PRODUCTS", "cols": ["id PK", "category_id FK", "price_cents", "stock", "reserved_stock", "sold", "revenue_cents"]},
        {"id": "ord", "name": "ORDERS", "cols": ["id PK CS-n/TG-n/RF-n", "cashier_id FK", "customer_id FK", "source walk-in|telegram", "status", "payment_status", "hold_label"]},
        {"id": "oi", "name": "ORDER_ITEMS", "cols": ["id PK", "order_id FK", "product_id FK", "quantity", "unit_price_cents", "line_total_cents"]},
        {"id": "op", "name": "ORDER_PAYMENTS", "cols": ["id PK", "order_id FK", "shift_id FK", "method cash|qr_manual", "status confirmed|failed", "amount_usd_cents"]},
        {"id": "ose", "name": "ORDER_STATUS_EVENTS", "cols": ["id PK", "order_id FK", "from_status", "to_status", "employee_id FK"]},
        {"id": "sh", "name": "SHIFTS", "cols": ["id PK", "employee_id FK", "opening_cash_*", "status Open|Closed"]},
    ]
    rels = [
        {"from": "emp", "to": "ord", "label": "cashier_id"},
        {"from": "cus", "to": "ord", "label": "customer_id"},
        {"from": "cat", "to": "pro", "label": "category_id"},
        {"from": "pro", "to": "oi", "label": "product_id"},
        {"from": "ord", "to": "oi", "label": "contains"},
        {"from": "ord", "to": "op", "label": "settled by"},
        {"from": "ord", "to": "ose", "label": "history"},
        {"from": "sh", "to": "op", "label": "shift_id"},
        {"from": "emp", "to": "op", "label": "confirmed_by_employee_id"},
        {"from": "emp", "to": "ose", "label": "employee_id"},
        {"from": "cat", "to": "cat", "label": "parent_category_id"},
        {"from": "ord", "to": "ord", "label": "parent_order_id"},
    ]
    s.append(scene_title("ERD - sales data in MySQL",
            "Real shape of the sales data in MySQL, pulled from the migration files. Nine tables, with relationships and key columns. Khmer narration is in the sidecar .srt file.",
            "Diagram: docs/diagrams/erd.md"))
    s.append(scene_erd("Tables 1/3 - people and catalog", full[0:3], rels))
    s.append(scene_erd("Tables 2/3 - products and orders", full[3:6], rels))
    s.append(scene_erd("Tables 3/3 - payments, events, shifts", full[6:9], rels))
    s.append(scene_erd("Key columns - ORDERS and PRODUCTS", [full[4], full[3]], rels))
    s.append(scene_title("Off-diagram tables",
            "order_number_sequences and store_shift_locks exist only to make the above race-safe: one row per order-id prefix, or one always-present row, row-locked. They hold no business data.",
            "race-safe plumbing"))
    s.append(scene_title("Cake shop example",
            "CUSTOMERS places ORDERS; ORDERS has ORDER_ITEMS pointing to PRODUCTS; payment settled by ORDER_PAYMENTS linked to SHIFTS and EMPLOYEES; history in ORDER_STATUS_EVENTS.",
            "all from real migrations"))
    return s


def main():
    out = os.path.join(os.path.dirname(__file__), "assets")
    builders = {"v2": v2_scenes, "v3": v3_scenes, "v4": v4_scenes, "v5": v5_scenes}
    for vid, fn in builders.items():
        scenes = fn()
        for i, img in enumerate(scenes, 1):
            p = os.path.join(out, f"{vid}_s{i}.png")
            img.save(p)
            print("wrote", p)


if __name__ == "__main__":
    main()
