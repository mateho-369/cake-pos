<?php
namespace App\Http\Controllers;
use App\Http\Requests\StoreBroadcastTemplateRequest;
use App\Models\BroadcastTemplate;
use Illuminate\Http\JsonResponse;
class BroadcastTemplateController extends Controller
{
    private function view(BroadcastTemplate $t): array
    {
        return [
            'id' => $t->id,
            'name' => $t->name,
            'imageUrl' => $t->image_url,
            'caption' => $t->caption,
            'createdAt' => $t->created_at?->toISOString(),
            'updatedAt' => $t->updated_at?->toISOString(),
        ];
    }
    public function index(): JsonResponse
    {
        return response()->json(
            BroadcastTemplate::latest()->get()->map(fn($t) => $this->view($t)),
        );
    }
    public function store(StoreBroadcastTemplateRequest $r): JsonResponse
    {
        $t = BroadcastTemplate::create([
            'name' => $r->name,
            'image_url' => $r->imageUrl,
            'caption' => $r->caption,
        ]);
        return response()->json($this->view($t), 201);
    }
    public function update(
        StoreBroadcastTemplateRequest $r,
        BroadcastTemplate $broadcastTemplate,
    ): JsonResponse {
        $broadcastTemplate->update([
            'name' => $r->name,
            'image_url' => $r->imageUrl,
            'caption' => $r->caption,
        ]);
        return response()->json($this->view($broadcastTemplate->fresh()));
    }
    public function destroy(BroadcastTemplate $broadcastTemplate): JsonResponse
    {
        $broadcastTemplate->delete();
        return response()->json(null, 204);
    }
}
