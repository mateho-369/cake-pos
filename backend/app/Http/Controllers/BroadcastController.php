<?php
namespace App\Http\Controllers;
use App\Http\Requests\StoreBroadcastRequest;
use App\Jobs\SendCustomerBroadcast;
use App\Models\Broadcast, Customer;
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
                        'message' => $b->message,
                        'sentAt' => $b->sent_at?->toISOString(),
                        'recipientCount' => $b->recipient_count,
                        'successCount' => $b->success_count,
                        'failureCount' => $b->failure_count,
                    ],
                ),
        );
    }
    public function store(StoreBroadcastRequest $request): JsonResponse
    {
        $count = Customer::whereNotNull('telegram_user_id')->count();
        $b = Broadcast::create([
            'message' => $request->validated()['message'],
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
