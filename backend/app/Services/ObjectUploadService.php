<?php
namespace App\Services;
use App\Models\Employee;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\{Cache, Storage};
use Illuminate\Support\Str;
class ObjectUploadService
{
    private const MAX_BYTES = 10 * 1024 * 1024;
    private const EXTENSIONS = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];
    public function presign(
        Employee $employee,
        string $fileName,
        string $contentType,
        int $fileSize,
    ): array {
        $extension = self::EXTENSIONS[$contentType];
        $key = 'product-images/' . Str::uuid() . '.' . $extension;
        $temporary = Storage::disk('s3_upload')->temporaryUploadUrl(
            $key,
            now()->addMinutes(10),
            ['ContentType' => $contentType],
        );
        Cache::put(
            $this->cacheKey($employee, $key),
            [
                'contentType' => $contentType,
                'fileName' => $fileName,
                'fileSize' => $fileSize,
            ],
            now()->addMinutes(15),
        );
        return [
            'uploadUrl' => $temporary['url'],
            'publicUrl' => $this->publicUrl($key),
            'uploadKey' => $key,
            'headers' => array_merge($temporary['headers'] ?? [], [
                'Content-Type' => $contentType,
            ]),
        ];
    }
    public function complete(Employee $employee, string $key): array
    {
        $pending = Cache::get($this->cacheKey($employee, $key));
        if (!$pending) {
            $this->fail('Upload authorization is missing or expired', 409);
        }
        $disk = Storage::disk('s3');
        if (!$disk->exists($key)) {
            $this->fail(
                'Uploaded object was not found. Please retry the upload.',
                409,
            );
        }
        $size = $disk->size($key);
        if (
            $size < 1 ||
            $size > self::MAX_BYTES ||
            $size !== (int) $pending['fileSize']
        ) {
            $disk->delete($key);
            Cache::forget($this->cacheKey($employee, $key));
            $this->fail(
                'Uploaded image size does not match the authorized file size or exceeds 10 MB',
                422,
            );
        }
        $stream = $disk->readStream($key);
        $sample = stream_get_contents($stream, 512 * 1024);
        if (is_resource($stream)) {
            fclose($stream);
        }
        $fileInfo = new \finfo(FILEINFO_MIME_TYPE);
        $actualType = $fileInfo->buffer($sample) ?: 'application/octet-stream';
        if (
            !isset(self::EXTENSIONS[$actualType]) ||
            $actualType !== $pending['contentType']
        ) {
            $disk->delete($key);
            Cache::forget($this->cacheKey($employee, $key));
            $this->fail(
                'Uploaded bytes do not match the requested image type',
                422,
            );
        }
        Cache::forget($this->cacheKey($employee, $key));
        return [
            'publicUrl' => $this->publicUrl($key),
            'size' => $size,
            'contentType' => $actualType,
        ];
    }
    private function publicUrl(string $key): string
    {
        $baseUrl = rtrim((string) config('filesystems.disks.s3.url'), '/');
        if ($baseUrl === '') {
            $this->fail('Object storage public URL is not configured', 500);
        }
        return $baseUrl . '/' . $key;
    }
    private function cacheKey(Employee $employee, string $key): string
    {
        return 'upload:' . $employee->id . ':' . hash('sha256', $key);
    }
    private function fail(string $message, int $status): never
    {
        throw new HttpResponseException(
            response()->json(['message' => $message], $status),
        );
    }
}
