<?php
namespace App\Http\Controllers;
use App\Http\Requests\{CompleteUploadRequest, PresignUploadRequest};
use App\Services\ObjectUploadService;
use Illuminate\Http\JsonResponse;
class UploadController extends Controller
{
    public function __construct(
        private readonly ObjectUploadService $uploads,
    ) {}
    public function presign(PresignUploadRequest $request): JsonResponse
    {
        return response()->json(
            $this->uploads->presign(
                $request->user(),
                $request->fileName,
                $request->contentType,
                (int) $request->fileSize,
            ),
        );
    }
    public function complete(CompleteUploadRequest $request): JsonResponse
    {
        return response()->json(
            $this->uploads->complete($request->user(), $request->uploadKey),
        );
    }
}
