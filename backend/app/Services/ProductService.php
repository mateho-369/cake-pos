<?php
namespace App\Services;
use App\Models\{Category, Product};
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
class ProductService
{
    public function values(array $input, ?Product $existing = null): array
    {
        $name = trim((string) ($input['name'] ?? $existing?->name));
        $category = trim(
            (string) ($input['category'] ?? $existing?->category?->name),
        );
        $stock = filter_var(
            $input['stock'] ?? $existing?->stock,
            FILTER_VALIDATE_INT,
        );
        if (!$name || !$category || $stock === false || $stock < 0) {
            throw ValidationException::withMessages([
                'product' => [
                    'name/category are required and stock must be a non-negative integer',
                ],
            ]);
        }
        $categoryId = Category::where('name', $category)
            ->where('active', true)
            ->value('id');
        if (!$categoryId) {
            throw ValidationException::withMessages([
                'category' => ['unknown category: ' . $category],
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
                now()->addDays(3)->toDateString());

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
            'image_url' => $input['imageUrl'] ?? $existing?->image_url,
            'active' =>
                (bool) ($input['active'] ?? ($existing?->active ?? true)),
        ];
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
}
