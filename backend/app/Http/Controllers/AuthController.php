<?php
namespace App\Http\Controllers;
use App\Http\Requests\LoginRequest;
use App\Services\StaffAuthenticationService;
use Illuminate\Http\{JsonResponse, Request};
class AuthController extends Controller
{
    public function __construct(
        private readonly StaffAuthenticationService $authentication,
    ) {}
    public function login(LoginRequest $request): JsonResponse
    {
        $employee = $this->authentication->authenticate($request->validated());
        $token = $employee->createToken(
            'pos-session',
            ['*'],
            now()->addHours(12),
        )->plainTextToken;
        return response()->json([
            'token' => $token,
            'employee' => array_filter(
                [
                    'id' => $employee->id,
                    'name' => $employee->name,
                    'email' => $employee->email,
                    'role' => $employee->role,
                ],
                fn($value) => $value !== null,
            ),
        ]);
    }
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();
        return response()->json(['ok' => true]);
    }
}
