<?php
namespace App\Http\Controllers;
use App\Http\Requests\{GeneratePosterRequest, StoreBroadcastRequest};
use App\Jobs\SendCustomerBroadcast;
use App\Models\{Broadcast, Customer, Product};
use App\Services\PromotionalPosterService;
use Illuminate\Http\JsonResponse;
class BroadcastController extends Controller
{
    public function preview(): JsonResponse
    {
        return response()->json([
            'recipientCount' => Customer::whereNotNull(
                'telegram_user_id',
            )->count(),
        ]);
    }
    public function index(): JsonResponse
    {
        return response()->json(
            Broadcast::latest()
                ->limit(50)
                ->get()
                ->map(
                    fn($b) => [
                        'id' => $b->id,
                        'caption' => $b->caption,
                        'imageUrl' => $b->image_url,
                        'sentAt' => $b->sent_at?->toISOString(),
                        'recipientCount' => $b->recipient_count,
                        'successCount' => $b->success_count,
                        'failureCount' => $b->failure_count,
                    ],
                ),
        );
    }
    public function poster(
        GeneratePosterRequest $request,
        PromotionalPosterService $posters,
    ): JsonResponse {
        $data = $request->validated();
        $url = $posters->generate(
            Product::findOrFail($data['productId']),
            $data['template'],
            $data['headline'] ?? null,
        );
        return response()->json(['imageUrl' => $url]);
    }
    public function store(StoreBroadcastRequest $request): JsonResponse
    {
        $data = $request->validated();
        $count = Customer::whereNotNull('telegram_user_id')->count();
        $b = Broadcast::create([
            'message' => $data['caption'],
            'caption' => $data['caption'],
            'image_url' => $data['imageUrl'] ?? null,
            'recipient_count' => $count,
            'created_by_employee_id' => $request->user()->id,
        ]);
        SendCustomerBroadcast::dispatch($b->id);
        return response()->json(
            ['id' => $b->id, 'recipientCount' => $count, 'status' => 'queued'],
            202,
        );
    }
}
