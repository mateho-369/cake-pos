<?php
namespace App\Services;
use App\Models\{Product, Setting};
use Illuminate\Support\Facades\{Http, Storage};
final class PromotionalPosterService
{
    public function generate(
        Product $product,
        string $template,
        ?string $headline = null,
    ): string {
        if (!function_exists('imagecreatetruecolor')) {
            abort(503, 'GD is required for poster generation');
        }
        $w = 1200;
        $h = 900;
        $im = imagecreatetruecolor($w, $h);
        $bg = imagecolorallocate($im, 255, 241, 247);
        $pink = imagecolorallocate($im, 184, 76, 117);
        $dark = imagecolorallocate($im, 61, 38, 49);
        imagefill($im, 0, 0, $bg);
        $image = null;
        if ($product->image_url) {
            try {
                $response = Http::timeout(8)->get($product->image_url);
                if ($response->successful()) {
                    $image = @imagecreatefromstring($response->body());
                }
            } catch (\Throwable $e) {
                report($e);
            }
        }
        if ($image) {
            $iw = imagesx($image);
            $ih = imagesy($image);
            $scale = max($w / $iw, 600 / $ih);
            $rw = (int) ($iw * $scale);
            $rh = (int) ($ih * $scale);
            imagecopyresampled(
                $im,
                $image,
                40,
                40,
                $rw > $w ? ($iw - $w / $scale) / 2 : 0,
                $rh > 600 ? ($ih - 600 / $scale) / 2 : 0,
                min($w - 80, $rw),
                600,
                min($iw, $w / $scale),
                min($ih, 600 / $scale),
            );
            imagedestroy($image);
        } else {
            imagefilledrectangle(
                $im,
                40,
                40,
                $w - 40,
                640,
                imagecolorallocate($im, 250, 215, 229),
            );
        }
        $font = __DIR__ . '/../../resources/fonts/DejaVuSans.ttf';
        $text =
            $headline ?:
            match ($template) {
                'selling_fast' => 'Selling fast / កំពុងលក់លឿន',
                'seasonal' => 'Seasonal special / ពិសេសតាមរដូវ',
                'default' => 'New arrival / នំថ្មី',
            };
        imagestring($im, 5, 70, 690, $text, $dark);
        imagestring(
            $im,
            5,
            70,
            730,
            $product->name .
                '  $' .
                number_format($product->price_cents / 100, 2),
            $pink,
        );
        $business =
            Setting::find('receipt_template')?->value_json['businessName'] ??
            'Cake Atelier';
        imagestring($im, 4, 70, 820, $business, $dark);
        $path = 'broadcasts/' . uniqid('poster-', true) . '.jpg';
        ob_start();
        imagejpeg($im, null, 88);
        $bytes = ob_get_clean();
        imagedestroy($im);
        Storage::disk(config('filesystems.default'))->put($path, $bytes);
        return Storage::disk(config('filesystems.default'))->url($path);
    }
}
