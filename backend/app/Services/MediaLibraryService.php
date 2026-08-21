<?php
namespace App\Services;
use App\Models\{Product, Broadcast, BroadcastTemplate};
use Illuminate\Support\Facades\Storage;
final class MediaLibraryService
{
    public function list(): array
    {
        $disk = Storage::disk('s3');
        $used = [];
        $add = function ($url, $label, $active = true) use (&$used) {
            if (!$url) {
                return;
            }
            $key = parse_url($url, PHP_URL_PATH);
            $key = ltrim(strstr($key, 'product-images/') ?: $key, '/');
            $used[$key][] = [$label, $active];
        };
        foreach (Product::get() as $p) {
            $add($p->image_url, 'product: ' . $p->name, (bool) $p->active);
        }
        foreach (BroadcastTemplate::all() as $t) {
            $add($t->image_url, 'template: ' . $t->name);
        }
        foreach (Broadcast::all() as $b) {
            $add($b->image_url, 'broadcast #' . $b->id);
        }
        $files = $disk->allFiles('product-images');
        $total = 0;
        $objects = [];
        foreach ($files as $key) {
            $size = $disk->size($key);
            $total += $size;
            $refs = $used[$key] ?? [];
            $active = array_filter($refs, fn($r) => $r[1]);
            $status = $active
                ? 'in_use'
                : ($refs
                    ? 'inactive_product'
                    : 'orphaned');
            $objects[] = [
                'key' => $key,
                'url' =>
                    rtrim(config('filesystems.disks.s3.url'), '/') . '/' . $key,
                'size' => $size,
                'lastModified' => $disk->lastModified($key),
                'status' => $status,
                'usedBy' => array_map(fn($r) => $r[0], $refs),
            ];
        }
        return [
            'totalBytes' => $total,
            'objectCount' => count($objects),
            'objects' => $objects,
        ];
    }
    public function delete(array $keys): int
    {
        $disk = Storage::disk('s3');
        $deleted = 0;
        foreach ($keys as $key) {
            if (!str_starts_with($key, 'product-images/')) {
                continue;
            }
            $data = $this->list();
            $obj = collect($data['objects'])->firstWhere('key', $key);
            if (!$obj || $obj['status'] === 'in_use') {
                continue;
            }
            $disk->delete($key);
            $deleted++;
        }
        return $deleted;
    }
}
