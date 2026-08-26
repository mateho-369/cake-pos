<?php
namespace App\Http\Controllers;
use App\Http\Requests\StoreWasteRequest;
use App\Services\WasteService;
use Illuminate\Http\JsonResponse;
class WasteController extends Controller
{
    public function __construct(private readonly WasteService $waste) {}
    public function store(StoreWasteRequest $request): JsonResponse
    {
        return response()->json(
            $this->waste->record($request->user(), $request->validated()),
            201,
        );
    }
}
