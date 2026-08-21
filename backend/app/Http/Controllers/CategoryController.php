<?php
namespace App\Http\Controllers;
use App\Http\Requests\SaveCategoryRequest;
use App\Http\Resources\CategoryResource;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
class CategoryController extends Controller
{
    public function index(): JsonResponse
    {
        $categories = Category::where('active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
        return response()->json(
            CategoryResource::collection($categories)->resolve(),
        );
    }
    public function store(SaveCategoryRequest $request): JsonResponse
    {
        $category = Category::create([
            'name' => trim($request->name),
            'color' => $request->input('color', '#be185d'),
            'active' => $request->boolean('active', true),
            'sort_order' => $request->input(
                'sortOrder',
                Category::max('sort_order') + 1,
            ),
        ]);
        return response()->json(
            CategoryResource::make($category)->resolve(),
            201,
        );
    }
    public function update(
        SaveCategoryRequest $request,
        Category $category,
    ): JsonResponse {
        $category->update([
            'name' => $request->input('name', $category->name),
            'color' => $request->input('color', $category->color),
            'active' => $request->has('active')
                ? $request->boolean('active')
                : $category->active,
            'sort_order' => $request->input('sortOrder', $category->sort_order),
        ]);
        return response()->json(CategoryResource::make($category)->resolve());
    }
    public function destroy(Category $category)
    {
        $category->update(['active' => false]);
        return response()->noContent();
    }
}
