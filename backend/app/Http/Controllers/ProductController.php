<?php
namespace App\Http\Controllers;
use App\Http\Requests\{ImportProductsRequest, SaveProductRequest};
use App\Http\Resources\ProductResource;
use App\Models\{OrderItem, Product};
use App\Services\ProductService;
use Illuminate\Http\JsonResponse;
class ProductController extends Controller
{
    public function __construct(private readonly ProductService $products) {}
    public function index(): JsonResponse
    {
        $products = Product::with('category')
            ->with('images')
            ->orderByDesc('active')
            ->orderBy('id')
            ->get();
        return response()->json(
            ProductResource::collection($products)->resolve(),
        );
    }
    public function store(SaveProductRequest $request): JsonResponse
    {
        $product = $this->products->create($request->validated());
        return response()->json(
            ProductResource::make($product->load('images'))->resolve(),
            201,
        );
    }
    public function update(
        SaveProductRequest $request,
        Product $product,
    ): JsonResponse {
        $this->products->update($request->validated(), $product);
        return response()->json(
            ProductResource::make($product->fresh('images'))->resolve(),
        );
    }
    public function destroy(Product $product)
    {
        if (OrderItem::where('product_id', $product->id)->exists()) {
            $product->update(['active' => false]);
        } else {
            $product->delete();
        }
        return response()->noContent();
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
