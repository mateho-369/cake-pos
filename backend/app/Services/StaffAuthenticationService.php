<?php
namespace App\Services;
use App\Models\Employee;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Hash;
class StaffAuthenticationService
{
    public function authenticate(array $credentials): Employee
    {
        if (!empty($credentials['email']) && !empty($credentials['password'])) {
            $employee = Employee::whereRaw('lower(email)=?', [
                strtolower(trim($credentials['email'])),
            ])
                ->where('active', true)
                ->first();
            if (
                !$employee ||
                !$employee->password_hash ||
                !Hash::check($credentials['password'], $employee->password_hash)
            ) {
                $this->reject('Invalid email or password');
            }
            return $employee;
        }
        if (!empty($credentials['pin_code'])) {
            foreach (
                Employee::where('active', true)
                    ->orderByDesc('role')
                    ->orderBy('id')
                    ->get()
                as $candidate
            ) {
                if (
                    $candidate->pin_hash &&
                    Hash::check(
                        (string) $credentials['pin_code'],
                        $candidate->pin_hash,
                    )
                ) {
                    return $candidate;
                }
            }
            $this->reject('Invalid PIN');
        }
        throw new HttpResponseException(
            response()->json(
                ['message' => 'Provide email and password, or pin_code'],
                400,
            ),
        );
    }
    private function reject(string $message): never
    {
        throw new HttpResponseException(
            response()->json(['message' => $message], 401),
        );
    }
}
