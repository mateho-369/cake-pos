<?php
namespace App\Http\Controllers;
use App\Jobs\SendStaffShiftNotification;
use App\Http\Requests\{CloseShiftRequest, OpenShiftRequest};
use App\Http\Resources\ShiftResource;
use App\Models\Shift;
use App\Services\ShiftService;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
class ShiftController extends Controller
{
    public function __construct(private readonly ShiftService $shifts) {}
    public function open(OpenShiftRequest $request): JsonResponse
    {
        $shift = $this->shifts->open(
            $request->user(),
            $request->openingCash,
            $request->input('openingCashKhr', 0),
        );
        $data = ShiftResource::make($shift)->resolve();
        $data['expectedCash'] = $data['openingCash'];
        $data['variance'] = 0;
        $data['startedAt'] = $shift->opened_at->format('g:i A');
        return response()
            ->json($data, 201)
            ->header('Cache-Control', 'no-store, private, max-age=0');
    }
    public function close(CloseShiftRequest $request): JsonResponse
    {
        [$shift, $cashSales] = $this->shifts->close(
            $request->user(),
            $request->closingCash,
            $request->input('closingCashKhr', 0),
        );
        SendStaffShiftNotification::dispatch($shift->id, $cashSales);
        $data = ShiftResource::make($shift)->resolve();
        $data['cashSales'] = Money::toDecimal($cashSales[0]);
        $data['cashSalesKhr'] = $cashSales[1];
        return response()
            ->json($data)
            ->header('Cache-Control', 'no-store, private, max-age=0');
    }
    public function current(): JsonResponse
    {
        $shift = $this->shifts->current();
        if (!$shift) {
            return response()
                ->json(null)
                ->header('Cache-Control', 'no-store, private, max-age=0');
        }
        $data = ShiftResource::make($shift)->resolve();
        if ($shift->status === 'Open') {
            $cash = $this->shifts->cashSalesSince($shift);
            $data['cashSalesUsdCents'] = $cash[0];
            $data['cashSalesKhr'] = $cash[1];
            $data['expectedCashUsdCents'] =
                $shift->opening_cash_usd_cents + $cash[0];
            $data['expectedCashKhr'] = $shift->opening_cash_khr + $cash[1];
        }
        $data['startedAt'] = $shift->opened_at->format('g:i A');
        return response()
            ->json($data)
            ->header('Cache-Control', 'no-store, private, max-age=0');
    }
    public function index(): JsonResponse
    {
        return response()
            ->json(
                ShiftResource::collection(
                    Shift::latest('opened_at')->limit(50)->get(),
                )->resolve(),
            )
            ->header('Cache-Control', 'no-store, private, max-age=0');
    }
}
