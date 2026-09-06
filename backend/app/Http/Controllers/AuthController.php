<?php
namespace App\Http\Controllers;
use App\Http\Requests\LoginRequest;
use App\Services\{AuditService, StaffAuthenticationService};
use Illuminate\Http\{JsonResponse, Request};
class AuthController extends Controller
{
    public function __construct(
        private readonly StaffAuthenticationService $authentication,
        private readonly AuditService $audit,
    ) {}
    public function login(LoginRequest $request): JsonResponse
    {
        $employee = $this->authentication->authenticate($request->validated());
        // One source of truth for the session length: sanctum.expiration
        // (minutes) is what Sanctum itself enforces on every request.
        $token = $employee->createToken(
            'pos-session',
            ['*'],
            now()->addMinutes((int) config('sanctum.expiration', 720)),
        )->plainTextToken;
        $this->audit->log($employee, 'auth.login', null, [
            'method' => $request->filled('pin_code') ? 'pin' : 'password',
        ]);
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
        $this->audit->log($request->user(), 'auth.logout');
        return response()->json(['ok' => true]);
    }
}
