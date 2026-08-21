<?php
namespace App\Services;

use App\Models\{Order, Receipt, Setting};
use App\Http\Resources\OrderResource;

class ReceiptService
{
    public function ensure(Order $order, bool $refresh = false): array
    {
        if ($refresh) {
            Receipt::whereKey($order->id)->delete();
        }
        // Persist the rendered inputs at completion so later template or customer
        // edits cannot silently change an already-issued receipt during reprint.
        $saved = Receipt::find($order->id);
        if ($saved) {
            return $saved->snapshot_json;
        }
        $template = Setting::find('receipt_template')?->value_json ?? [
            'paperSize' => '80mm',
            'language' => 'en',
            'businessName' => 'Cake Shop',
            'address' => '',
            'logoUrl' => '',
            'footerMessage' => 'Thank you!',
        ];
        $snapshot = [
            'template' => $template,
            'order' => OrderResource::make(
                $order->fresh(['cashier', 'customer']),
            )->resolve(),
        ];
        Receipt::create([
            'order_id' => $order->id,
            'snapshot_json' => $snapshot,
            'created_at' => now(),
        ]);
        return $snapshot;
    }
    private function escapeHtml($value): string
    {
        return htmlspecialchars(
            (string) ($value ?? ''),
            ENT_QUOTES | ENT_SUBSTITUTE,
            'UTF-8',
        );
    }
    public function html(array $s, int $copies): string
    {
        $t = $s['template'];
        $o = $s['order'];
        $km = ($t['language'] ?? 'en') === 'km';
        $l = $km
            ? [
                'receipt' => 'បង្កាន់ដៃ',
                'order' => 'ការបញ្ជាទិញ',
                'total' => 'សរុប',
                'payment' => 'ការទូទាត់',
                'customer' => 'ច្បាប់អតិថិជន',
                'store' => 'ច្បាប់ហាង',
            ]
            : [
                'receipt' => 'RECEIPT',
                'order' => 'Order',
                'total' => 'Total',
                'payment' => 'Payment',
                'customer' => 'Customer copy',
                'store' => 'Store copy',
            ];
        $paper = in_array($t['paperSize'] ?? '', ['58mm', '80mm', 'A4'], true)
            ? $t['paperSize']
            : '80mm';
        $twoUp = $copies === 2 && $paper === 'A4';
        $width =
            $paper === '58mm'
                ? '58mm'
                : ($paper === 'A4'
                    ? ($copies === 2
                        ? '90mm'
                        : '190mm')
                    : '80mm');
        $copy = function ($title) use ($t, $o, $l) {
            $lines = '';
            foreach ($o['detail'] as $item) {
                $lines .=
                    '<div><span>' . $this->escapeHtml($item) . '</span></div>';
            }
            $discount =
                ($o['discountAmount'] ?? 0) > 0
                    ? '<div class="payment"><span>Subtotal</span><b>$' .
                        number_format($o['subtotal'], 2) .
                        '</b></div><div class="payment"><span>Discount</span><b>-$' .
                        number_format($o['discountAmount'], 2) .
                        '</b></div>'
                    : '';
            return '<article class="receipt"><div class="copy-label">' .
                $this->escapeHtml($title) .
                '</div>' .
                (!empty($t['logoUrl'])
                    ? '<img class="logo" src="' .
                        $this->escapeHtml($t['logoUrl']) .
                        '" alt="">'
                    : '') .
                '<h1>' .
                $this->escapeHtml($t['businessName']) .
                '</h1><p class="address">' .
                $this->escapeHtml($t['address']) .
                '</p><h2>' .
                $l['receipt'] .
                '</h2><div class="meta"><span>' .
                $l['order'] .
                '</span><b>' .
                $this->escapeHtml($o['id']) .
                '</b><span>' .
                $this->escapeHtml($o['createdAt']) .
                '</span><b>' .
                $this->escapeHtml($o['customer']['name'] ?? $o['cashier']) .
                '</b></div><div class="lines">' .
                $lines .
                '</div>' .
                $discount .
                '<div class="total"><span>' .
                $l['total'] .
                '</span><b>$' .
                number_format($o['total'], 2) .
                '</b></div><div class="payment"><span>' .
                $l['payment'] .
                '</span><b>' .
                $this->escapeHtml($o['payment'] ?? 'Pending') .
                '</b></div><footer>' .
                $this->escapeHtml($t['footerMessage']) .
                '</footer></article>';
        };
        $page = $paper === 'A4' ? 'A4' : $width . ' auto';
        $cols = $twoUp ? 'repeat(2,' . $width . ')' : $width;
        $break =
            $copies === 2 && !$twoUp
                ? '.receipt:not(:last-child){break-after:page}'
                : '';
        return '<!doctype html><html lang="' .
            ($km ? 'km' : 'en') .
            '"><head><meta charset="utf-8"><title>' .
            $this->escapeHtml($o['id']) .
            ' receipt</title><style>@page{margin:5mm;size:' .
            $page .
            '}*{box-sizing:border-box}body{margin:0;color:#111;background:#eee;font:12px/1.4 ui-monospace,monospace}.sheet{max-width:' .
            ($twoUp ? '190mm' : $width) .
            ';margin:20px auto;display:grid;grid-template-columns:' .
            $cols .
            ';gap:8mm}.receipt{padding:5mm;background:#fff}.copy-label{text-align:right;font-size:9px;color:#666}.logo{display:block;max-width:30mm;max-height:20mm;margin:0 auto 3mm}h1,h2{text-align:center}.address{text-align:center;white-space:pre-line}.meta{display:grid;grid-template-columns:1fr auto;gap:1mm;padding:3mm 0;border-block:1px dashed}.lines{padding:3mm 0}.total,.payment{display:flex;justify-content:space-between;padding:2mm 0;border-top:1px dashed}.total{font-size:15px}footer{margin-top:5mm;padding-top:3mm;text-align:center;border-top:1px dashed;white-space:pre-line}@media print{body{background:#fff}.sheet{margin:0}.receipt{break-inside:avoid}' .
            $break .
            '}</style></head><body><main class="sheet">' .
            $copy($l['customer']) .
            ($copies === 2 ? $copy($l['store']) : '') .
            '</main><script>addEventListener("load",()=>setTimeout(()=>print(),120))</script></body></html>';
    }
}
