<?php
namespace App\Http\Controllers;
use App\Http\Resources\{CustomerResource, OrderResource};
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
class CustomerController extends Controller
{
    public function index(): JsonResponse
    {
        $customers = Customer::withCount('orders')
            ->withSum(
                [
                    'orders as total_spent' => fn($query) => $query->whereIn(
                        'status',
                        ['Paid', 'Ready', 'Completed', 'Refunded', 'Voided'],
                    ),
                ],
                'total_cents',
            )
            ->latest('first_seen_at')
            ->get();
        return response()->json(
            CustomerResource::collection($customers)->resolve(),
        );
    }
    public function orders(Customer $customer): JsonResponse
    {
        $orders = $customer->orders()->latest('created_at')->get();
        return response()->json(OrderResource::collection($orders)->resolve());
    }
}
