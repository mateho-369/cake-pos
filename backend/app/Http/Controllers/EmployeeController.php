<?php
namespace App\Http\Controllers;
use App\Http\Requests\SaveEmployeeRequest;
use App\Http\Resources\EmployeeResource;
use App\Models\Employee;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\Hash;
class EmployeeController extends Controller
{
    public function index(): JsonResponse
    {
        $employees = Employee::orderByDesc('active')->orderBy('id')->get();
        return response()->json(
            EmployeeResource::collection($employees)->resolve(),
        );
    }
    public function store(SaveEmployeeRequest $request): JsonResponse
    {
        $employee = Employee::create([
            'name' => $request->name,
            'email' => $request->email,
            'role' =>
                strtolower((string) $request->role) === 'admin'
                    ? 'admin'
                    : 'cashier',
            'password_hash' => $request->password
                ? Hash::make($request->password)
                : null,
            'pin_hash' => $request->pin_code
                ? Hash::make((string) $request->pin_code)
                : null,
            'active' => $request->boolean('active', true),
            'created_at' => now(),
        ]);
        return response()->json(
            EmployeeResource::make($employee)->resolve(),
            201,
        );
    }
    public function update(
        SaveEmployeeRequest $request,
        Employee $employee,
    ): JsonResponse {
        $employee->update([
            'name' => $request->input('name', $employee->name),
            'email' => $request->input('email', $employee->email),
            'role' =>
                strtolower(
                    (string) $request->input('role', $employee->role),
                ) === 'admin'
                    ? 'admin'
                    : 'cashier',
            'password_hash' => $request->password
                ? Hash::make($request->password)
                : $employee->password_hash,
            'pin_hash' => $request->input('pin_code')
                ? Hash::make((string) $request->pin_code)
                : $employee->pin_hash,
            'active' => $request->has('active')
                ? $request->boolean('active')
                : $employee->active,
        ]);
        return response()->json(EmployeeResource::make($employee)->resolve());
    }
    public function destroy(Request $request, Employee $employee)
    {
        if ($employee->id === $request->user()->id) {
            return response()->json(
                ['message' => 'You cannot deactivate your own account'],
                400,
            );
        }
        $employee->tokens()->delete();
        $employee->update(['active' => false]);
        return response()->noContent();
    }
}
