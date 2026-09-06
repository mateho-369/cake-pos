<?php
namespace App\Http\Controllers;
use App\Http\Requests\{ImportProductsRequest, SaveProductRequest};
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Services\{AuditService, ProductService};
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;
class ProductController extends Controller
{
    public function __construct(
        private readonly ProductService $products,
        private readonly AuditService $audit,
    ) {}
    public function index(): JsonResponse
    {
        $products = Product::with('category')
            ->with('images')
            ->withCount('orderItems')
            ->orderByDesc('active')
            ->orderBy('id')
            ->get();
        return response()->json(
            ProductResource::collection($products)->resolve(),
        );
    }
    public function store(SaveProductRequest $request): JsonResponse
    {
        $product = $this->products->create(
            $request->validated(),
            $request->user(),
        );
        $this->audit->log($request->user(), 'product.created', null, [
            'productId' => $product->id,
            'productName' => $product->name,
            'priceCents' => $product->price_cents,
            'stock' => (int) $product->stock,
        ]);
        return response()->json(
            ProductResource::make($product->load('images'))->resolve(),
            201,
        );
    }
    public function update(
        SaveProductRequest $request,
        Product $product,
    ): JsonResponse {
        $before = $product->only(['name', 'price_cents', 'stock', 'active', 'category_id']);
        $product = $this->products->update(
            $request->validated(),
            $product,
            $request->user(),
        );
        $after = $product->only(['name', 'price_cents', 'stock', 'active', 'category_id']);
        // Deactivation / stock-zeroing already writes its own reasoned
        // event (product.deactivated / product.stock_zeroed) — don't
        // double-log those; record every other edit here.
        $reasoned =
            ($before['active'] && !$after['active']) ||
            ($before['stock'] > 0 && (int) $after['stock'] === 0);
        if ($before != $after && !$reasoned) {
            $this->audit->log($request->user(), 'product.updated', null, [
                'productId' => $product->id,
                'productName' => $product->name,
                'before' => $before,
                'after' => $after,
            ]);
        }
        return response()->json(
            ProductResource::make($product->fresh('images'))->resolve(),
        );
    }
    public function destroy(Product $product): JsonResponse
    {
        // Products referenced by past orders must stay around so order
        // history keeps making sense. They are hard non-deletable; the UI
        // offers archive/deactivate for those instead.
        if ($product->orderItems()->exists()) {
            return response()->json(
                [
                    'message' =>
                        'Can\'t delete — referenced by past orders, deactivate instead',
                    'referenced_by_orders' => true,
                ],
                422,
            );
        }

        $snapshot = ['productId' => $product->id, 'productName' => $product->name];
        $this->deleteProductAndAssets($product);
        $this->audit->log(request()->user(), 'product.deleted', null, $snapshot);

        return response()->json(
            [
                'message' => 'Product deleted',
                'deleted' => true,
            ],
            200,
        );
    }

    /**
     * Hard-delete a product that has no order history, cleaning up its
     * product_images rows and (best-effort) the associated R2 / S3 objects
     * so storage does not accumulate orphaned files.
     */
    private function deleteProductAndAssets(Product $product): void
    {
        $imageUrls = array_values(
            array_unique(
                array_filter(
                    array_merge(
                        $product->images()->pluck('url')->all(),
                        $product->image_url ? [$product->image_url] : [],
                    ),
                ),
            ),
        );

        DB::transaction(function () use ($product) {
            // Remove the ProductImage rows first, then the product itself.
            $product->images()->delete();
            $product->delete();
        });

        // Object-storage cleanup is intentionally best-effort: a flaky or
        // unconfigured R2 bucket should not make the product undeletable.
        // The database rows are already gone at this point, so any leftover
        // object is orphaned anyway — we log and move on.
        foreach ($imageUrls as $url) {
            $this->deleteStorageObject($url);
        }
    }

    /**
     * The URLs stored in ProductImage (and the legacy image_url column) are
     * public URLs like {s3.url}/product-images/{key}; peel the path back out
     * into a storage key and delete the object from the R2 / S3 disk.
     */
    private function deleteStorageObject(string $url): void
    {
        $path = parse_url($url, PHP_URL_PATH);
        if (!$path) {
            return;
        }

        $key = ltrim(strstr($path, 'product-images/') ?: $path, '/');
        if ($key === '') {
            return;
        }

        try {
            $disk = Storage::disk('s3');
            if ($disk->exists($key)) {
                $disk->delete($key);
            }
        } catch (Throwable $exception) {
            Log::warning('Failed to delete product image object from storage', [
                'key' => $key,
                'error' => $exception->getMessage(),
            ]);
        }
    }

    public function import(ImportProductsRequest $request): JsonResponse
    {
        [$created, $skipped] = $this->products->import(
            $request->validated('rows'),
        );
        return response()->json(
            [
                'created' => ProductResource::collection(
                    collect($created),
                )->resolve(),
                'skipped' => $skipped,
            ],
            201,
        );
    }
}
