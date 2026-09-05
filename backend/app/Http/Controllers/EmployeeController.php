<?php
namespace App\Http\Controllers;
use App\Http\Requests\SaveEmployeeRequest;
use App\Http\Resources\EmployeeResource;
use App\Models\Employee;
use App\Services\AuditService;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\Hash;
class EmployeeController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}
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
        $this->audit->log($request->user(), 'employee.created', null, [
            'employeeId' => $employee->id,
            'employeeName' => $employee->name,
            'role' => $employee->role,
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
        $before = $employee->only(['name', 'email', 'role', 'active']);
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
        // Credentials are never written to the trail — only whether they
        // were rotated.
        $this->audit->log($request->user(), 'employee.updated', null, [
            'employeeId' => $employee->id,
            'employeeName' => $employee->name,
            'before' => $before,
            'after' => $employee->only(['name', 'email', 'role', 'active']),
            'passwordChanged' => (bool) $request->password,
            'pinChanged' => (bool) $request->input('pin_code'),
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
        $this->audit->log($request->user(), 'employee.deactivated', null, [
            'employeeId' => $employee->id,
            'employeeName' => $employee->name,
        ]);
        return response()->noContent();
    }
}
