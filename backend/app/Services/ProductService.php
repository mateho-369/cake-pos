<?php
namespace App\Services;
use App\Models\{Category, Employee, Product, ProductImage, Setting};
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ProductService
{
    public function __construct(private readonly AuditService $audit) {}

    public function create(array $input, ?Employee $employee = null): Product
    {
        $values = $this->values($input);
        return DB::transaction(function () use ($values, $input, $employee) {
            $product = Product::create($values);
            $this->syncImages($product, $input['images'] ?? null);
            return $product->fresh(['images']);
        });
    }

    public function update(
        array $input,
        Product $product,
        ?Employee $employee = null,
    ): Product {
        $values = $this->values($input, $product);
        return DB::transaction(
            function () use ($product, $values, $input, $employee) {
                $before = [
                    'active' => (bool) $product->active,
                    'stock' => (int) $product->stock,
                ];
                $product->update($values);
                $this->syncImages($product->fresh(), $input['images'] ?? null);
                $this->recordReasonEvents(
                    $product->fresh(),
                    $before,
                    $input,
                    $employee,
                );
                return $product->fresh(['images']);
            },
        );
    }

    /**
     * Manual deactivation / stock-zeroing of an evergreen product is an
     * accountability event: WHO took it off sale, WHEN, and WHY. The reason
     * (picklist code + optional free-text note) lands in the same
     * audit_events trail as discounts, voids and shift closes.
     */
    private function recordReasonEvents(
        Product $product,
        array $before,
        array $input,
        ?Employee $employee,
    ): void {
        $reasonCode = $input['reasonCode'] ?? null;
        $reasonNote = trim((string) ($input['reasonNote'] ?? '')) ?: null;
        $deactivated = $before['active'] && !$product->active;
        $stockZeroed = $before['stock'] > 0 && (int) $product->stock === 0;
        if (!$deactivated && !$stockZeroed) {
            return;
        }
        if ($deactivated || $stockZeroed) {
            if ($reasonCode === null) {
                throw ValidationException::withMessages([
                    'reasonCode' => [
                        'A reason is required when deactivating a product or setting its stock to 0',
                    ],
                ]);
            }
        }
        $common = [
            'productId' => $product->id,
            'productName' => $product->name,
            'reasonCode' => $reasonCode,
            'reasonNote' => $reasonNote,
            'activeBefore' => $before['active'],
            'activeAfter' => (bool) $product->active,
            'stockBefore' => $before['stock'],
            'stockAfter' => (int) $product->stock,
        ];
        if ($deactivated) {
            $this->audit->log(
                $employee,
                'product.deactivated',
                null,
                $common,
            );
        }
        if ($stockZeroed) {
            $this->audit->log($employee, 'product.stock_zeroed', null, $common);
        }
    }

    public function values(array $input, ?Product $existing = null): array
    {
        $name = trim((string) ($input['name'] ?? $existing?->name));
        $categoryId = $this->resolveCategoryId($input, $existing);
        $stock = filter_var(
            $input['stock'] ?? $existing?->stock,
            FILTER_VALIDATE_INT,
        );
        if (!$name || !$categoryId || $stock === false || $stock < 0) {
            throw ValidationException::withMessages([
                'product' => [
                    'name/category are required and stock must be a non-negative integer',
                ],
            ]);
        }
        $price = array_key_exists('price', $input)
            ? Money::fromDecimal($input['price'], 'price')
            : $existing?->price_cents ??
                throw ValidationException::withMessages([
                    'price' => ['price is required'],
                ]);
        $bestBefore =
            $input['bestBefore'] ??
            ($existing?->best_before?->format('Y-m-d') ??
                now()
                    ->addDays(
                        (int) (Setting::find('pos_rules')?->value_json[
                            'defaultShelfLifeDays'
                        ] ?? 3),
                    )
                    ->toDateString());
        $images = $this->normalizedImages($input['images'] ?? null, $existing);
        $primaryImageUrl =
            $input['imageUrl'] ?? ($images[0]['url'] ?? $existing?->image_url);

        return [
            'name' => $name,
            'category_id' => $categoryId,
            'price_cents' => $price,
            'stock' => $stock,
            'made_at' =>
                $input['madeAt'] ??
                ($existing?->made_at?->format('Y-m-d') ??
                    now()->toDateString()),
            'best_before' =>
                $bestBefore === 'Made to order' ? null : $bestBefore,
            'image_position' =>
                (string) ($input['imagePosition'] ??
                    ($existing?->image_position ?? '0% 0%')),
            'image_url' => $primaryImageUrl,
            'active' =>
                (bool) ($input['active'] ?? ($existing?->active ?? true)),
            'hide_when_out_of_stock' =>
                (bool) ($input['hideWhenOutOfStock'] ??
                    ($existing?->hide_when_out_of_stock ?? false)),
        ];
    }

    /**
     * Category resolution against the REAL categories table (the same rows
     * the admin Categories page manages). categoryId wins when present — it
     * survives renames and duplicate names. The name string remains as a
     * fallback for older callers (sale quick-add, CSV import).
     */
    private function resolveCategoryId(
        array $input,
        ?Product $existing,
    ): ?int {
        if (array_key_exists('categoryId', $input)) {
            $id = (int) ($input['categoryId'] ?? 0);
            if ($id > 0) {
                $found = Category::where('id', $id)
                    ->where('active', true)
                    ->value('id');
                if (!$found) {
                    throw ValidationException::withMessages([
                        'category' => ["unknown category id: {$id}"],
                    ]);
                }
                return (int) $found;
            }
        }
        $category = trim((string) ($input['category'] ?? ''));
        if ($category === '') {
            // Partial update with no category change: keep the existing
            // category as-is (by id, so a later rename cannot silently move
            // this product).
            return $existing ? (int) $existing->category_id : null;
        }
        $found = Category::where('name', $category)
            ->where('active', true)
            ->value('id');
        if (!$found) {
            throw ValidationException::withMessages([
                'category' => ['unknown category: ' . $category],
            ]);
        }
        return (int) $found;
    }

    public function import(array $rows): array
    {
        $categories = Category::where('active', true)->pluck('id', 'name');
        $valid = [];
        $skipped = [];
        foreach ($rows as $index => $row) {
            $errors = [];
            $name = trim((string) ($row['name'] ?? ''));
            $category = trim((string) ($row['category'] ?? ''));
            $stock = filter_var($row['stock'] ?? null, FILTER_VALIDATE_INT);
            try {
                $price = Money::fromDecimal($row['price'] ?? '', 'price');
            } catch (ValidationException) {
                $price = null;
                $errors[] =
                    'price must be a non-negative amount with at most two decimal places';
            }
            if (!$name) {
                $errors[] = 'name is required';
            }
            if (!$category) {
                $errors[] = 'category is required';
            } elseif (!$categories->has($category)) {
                $errors[] = "unknown category: $category";
            }
            if ($stock === false || $stock < 0) {
                $errors[] = 'stock must be a non-negative integer';
            }
            if (empty($row['madeAt'])) {
                $errors[] = 'madeAt is required';
            }
            if (empty($row['bestBefore'])) {
                $errors[] = 'bestBefore is required';
            }
            if ($errors) {
                $skipped[] = [
                    'row' => (int) ($row['_row'] ?? $index + 2),
                    'errors' => $errors,
                ];
            } else {
                $valid[] = [
                    'name' => $name,
                    'category_id' => $categories->get($category),
                    'price_cents' => $price,
                    'stock' => $stock,
                    'made_at' => $row['madeAt'],
                    'best_before' => $row['bestBefore'],
                    'image_position' => '0% 0%',
                    'image_url' => $row['imageUrl'] ?? null,
                    'active' => true,
                ];
            }
        }
        $created = DB::transaction(
            fn() => collect($valid)
                ->map(fn($values) => Product::create($values))
                ->all(),
        );
        return [$created, $skipped];
    }

    private function syncImages(Product $product, ?array $images): void
    {
        if ($images === null) {
            return;
        }
        $normalized = $this->normalizedImages($images);
        $product->images()->delete();
        foreach (array_slice($normalized, 0, 5) as $index => $image) {
            ProductImage::create([
                'product_id' => $product->id,
                'url' => $image['url'],
                'caption' => (string) ($image['caption'] ?? ''),
                'sort_order' => $index,
            ]);
        }
    }

    private function normalizedImages(
        ?array $images,
        ?Product $existing = null,
    ): array {
        $source = $images;
        if (
            $source === null &&
            $existing &&
            $existing->relationLoaded('images')
        ) {
            $source = $existing->images
                ->map(
                    fn($image) => [
                        'url' => $image->url,
                        'caption' => $image->caption,
                        'sortOrder' => $image->sort_order,
                    ],
                )
                ->all();
        }
        if ($source === null && $existing?->image_url) {
            $source = [
                [
                    'url' => $existing->image_url,
                    'caption' => '',
                    'sortOrder' => 0,
                ],
            ];
        }
        if ($source === null) {
            return [];
        }
        return collect($source)
            ->map(
                fn($image) => [
                    'url' => trim(
                        (string) ($image['url'] ?? ($image['imageUrl'] ?? '')),
                    ),
                    'caption' => trim((string) ($image['caption'] ?? '')),
                    'sortOrder' => (int) ($image['sortOrder'] ?? 0),
                ],
            )
            ->filter(fn($image) => $image['url'] !== '')
            ->sortBy('sortOrder')
            ->values()
            ->all();
    }
}
