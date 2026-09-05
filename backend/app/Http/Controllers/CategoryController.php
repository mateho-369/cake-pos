<?php
namespace App\Http\Controllers;
use App\Http\Requests\SaveCategoryRequest;
use App\Http\Resources\CategoryResource;
use App\Jobs\SendStaffCategoryProposedNotification;
use App\Models\Category;
use App\Models\Product;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class CategoryController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    public function index(): JsonResponse
    {
        $categories = Category::where('active', true)
            ->with(['parent', 'createdBy'])
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
        return response()->json(
            CategoryResource::collection($categories)->resolve(),
        );
    }

    /**
     * Any authenticated employee may create a category, because the counter
     * is not the place to wait for an admin: the owner says "add a Seasonal
     * category for this" and the cashier needs it now.
     *
     * It is created ACTIVE so the product being entered can use it straight
     * away, but a cashier-made category is flagged pending_review, the owner
     * gets a Telegram nudge, and Admin > Categories can approve or reject it.
     * Placing a category under a parent stays admin-only — that is a taxonomy
     * decision, not a same-second sales need.
     */
    public function store(SaveCategoryRequest $request): JsonResponse
    {
        $employee = $request->user();
        $isAdmin = $employee?->role === 'admin';
        $requestedParent = $request->input('parentCategoryId');
        if (!$isAdmin && $requestedParent) {
            throw ValidationException::withMessages([
                'parentCategoryId' => [
                    'Only an admin can place a category under a parent',
                ],
            ]);
        }
        $parent = $isAdmin ? $this->resolveParent($requestedParent) : null;
        $category = Category::create([
            'name' => trim($request->name),
            'color' => $request->input('color', '#be185d'),
            'active' => $request->boolean('active', true),
            'sort_order' => $request->input(
                'sortOrder',
                Category::max('sort_order') + 1,
            ),
            'parent_category_id' => $parent?->id,
            'pending_review' => !$isAdmin,
            'created_by_employee_id' => $isAdmin ? null : $employee?->id,
            'created_at' => $isAdmin ? null : now(),
        ]);
        if (!$isAdmin) {
            $this->audit->log($employee, 'category.created_by_cashier', null, [
                'categoryId' => $category->id,
                'name' => $category->name,
                'pendingReview' => true,
            ]);
            SendStaffCategoryProposedNotification::dispatch(
                $category->id,
                $employee?->name ?? '—',
            );
        }
        return response()->json(
            CategoryResource::make(
                $category->load(['parent', 'createdBy']),
            )->resolve(),
            201,
        );
    }

    /**
     * Admin review of a cashier-proposed category.
     *   approve -> clears the flag, the category is a normal one now.
     *   reject  -> deactivates it, but only once no product still uses it, so
     *              no product is ever left pointing at a dead category.
     */
    public function review(Request $request, Category $category): JsonResponse {
        $action = strtolower((string) $request->input('action'));
        if (!in_array($action, ['approve', 'reject'], true)) {
            throw ValidationException::withMessages([
                'action' => ['action must be "approve" or "reject"'],
            ]);
        }
        if ($action === 'approve') {
            $category->update(['pending_review' => false]);
            $this->audit->log(
                $request->user(),
                'category.approved',
                null,
                ['categoryId' => $category->id, 'name' => $category->name],
            );
            return response()->json(
                CategoryResource::make(
                    $category->fresh()->load(['parent', 'createdBy']),
                )->resolve(),
            );
        }
        $usedBy = Product::where('category_id', $category->id)
            ->where('active', true)
            ->count();
        if ($usedBy > 0) {
            throw ValidationException::withMessages([
                'category' => [
                    "{$usedBy} active product(s) still use this category — move them to another category first",
                ],
            ]);
        }
        $category->update(['pending_review' => false, 'active' => false]);
        $this->audit->log(
            $request->user(),
            'category.rejected',
            null,
            ['categoryId' => $category->id, 'name' => $category->name],
        );
        return response()->json(
            CategoryResource::make(
                $category->fresh()->load(['parent', 'createdBy']),
            )->resolve(),
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
        // Same invariant as review()'s reject path: never leave a product
        // pointing at a dead category.
        $usedBy = Product::where('category_id', $category->id)
            ->where('active', true)
            ->count();
        if ($usedBy > 0) {
            throw ValidationException::withMessages([
                'category' => [
                    "{$usedBy} active product(s) still use this category — move them to another category first",
                ],
            ]);
        }
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
