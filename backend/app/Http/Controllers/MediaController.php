<?php
namespace App\Http\Controllers;
use App\Http\Requests\DeleteMediaRequest;
use App\Services\MediaLibraryService;
use Illuminate\Http\JsonResponse;
class MediaController extends Controller
{
    public function index(MediaLibraryService $media): JsonResponse
    {
        return response()->json($media->list());
    }
    public function destroy(
        DeleteMediaRequest $request,
        MediaLibraryService $media,
    ): JsonResponse {
        return response()->json([
            'deleted' => $media->delete($request->validated()['keys']),
        ]);
    }
}
