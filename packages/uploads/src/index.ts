type ApiRequest = <T>(path: string, options?: RequestInit) => Promise<T>

type PresignedUpload = {
  uploadUrl: string
  publicUrl: string
  uploadKey: string
  headers: Record<string, string>
}

type CompletedUpload = {
  publicUrl: string
  size: number
  contentType: string
}

const UPLOAD_TIMEOUT_MS = 45_000

/** Uploads directly to object storage, then asks Laravel to inspect the bytes. */
export async function uploadImage(
  file: File,
  apiRequest: ApiRequest,
): Promise<CompletedUpload> {
  const presigned = await apiRequest<PresignedUpload>('/api/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
    }),
  })

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)

  try {
    const browserSafeHeaders = Object.fromEntries(
      Object.entries(presigned.headers).filter(
        ([name]) => !['host', 'content-length'].includes(name.toLowerCase()),
      ),
    )
    const response = await fetch(presigned.uploadUrl, {
      method: 'PUT',
      headers: browserSafeHeaders,
      body: file,
      signal: controller.signal,
    })
    if (!response.ok)
      throw new Error(`Image upload failed (${response.status})`)
  } catch (reason) {
    if (reason instanceof Error && reason.name === 'AbortError') {
      throw new Error(
        'Image upload timed out after 45 seconds. Please check the connection and retry.',
      )
    }
    throw reason
  } finally {
    window.clearTimeout(timeout)
  }

  return apiRequest<CompletedUpload>('/api/uploads/complete', {
    method: 'POST',
    body: JSON.stringify({ uploadKey: presigned.uploadKey }),
  })
}
