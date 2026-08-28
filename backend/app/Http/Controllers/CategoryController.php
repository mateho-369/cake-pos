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
            ->with('parent')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
        return response()->json(
            CategoryResource::collection($categories)->resolve(),
        );
    }

    public function store(SaveCategoryRequest $request): JsonResponse
    {
        $parent = $this->resolveParent($request->input('parentCategoryId'));
        $category = Category::create([
            'name' => trim($request->name),
            'color' => $request->input('color', '#be185d'),
            'active' => $request->boolean('active', true),
            'sort_order' => $request->input(
                'sortOrder',
                Category::max('sort_order') + 1,
            ),
            'parent_category_id' => $parent?->id,
        ]);
        return response()->json(
            CategoryResource::make($category->load('parent'))->resolve(),
            201,
        );
    }

    public function update(
        SaveCategoryRequest $request,
        Category $category,
    ): JsonResponse {
        $parent = $this->resolveParent(
            $request->input('parentCategoryId'),
            $category,
        );
        $category->update([
            'name' => $request->input('name', $category->name),
            'color' => $request->input('color', $category->color),
            'active' => $request->has('active')
                ? $request->boolean('active')
                : $category->active,
            'sort_order' => $request->input('sortOrder', $category->sort_order),
            'parent_category_id' => $request->has('parentCategoryId')
                ? $parent?->id
                : $category->parent_category_id,
        ]);
        return response()->json(
            CategoryResource::make($category->fresh()?->load('parent'))->resolve(),
        );
    }

    public function destroy(Category $category)
    {
        $category->update(['active' => false]);
        return response()->noContent();
    }

    /**
     * Validate the requested parent for the one-level hierarchy: it must be
     * top-level itself (no grandparent nesting) and cannot be the category
     * being edited. Returns null for "no parent" (a flat top-level category).
     */
    private function resolveParent(
        mixed $parentCategoryId,
        ?Category $excluding = null,
    ): ?Category {
        if ($parentCategoryId === null || $parentCategoryId === '') {
            return null;
        }
        $parent = Category::find((int) $parentCategoryId);
        if (!$parent) {
            abort(422, 'Unknown parent category');
        }
        if ($excluding && $parent->id === $excluding->id) {
            abort(422, 'A category cannot be its own parent');
        }
        if ($parent->parent_category_id !== null) {
            abort(422, 'Subcategories cannot have children (one level only)');
        }
        return $parent;
    }
}
