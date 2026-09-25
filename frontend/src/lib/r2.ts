/**
 * Client-side direct-to-R2 upload for the founder pitch video.
 *
 * The video bytes go straight from the browser to Cloudflare R2 using a
 * presigned PUT URL minted by `/api/upload/presign`, so large files are not
 * limited by the serverless request-body cap that constrains the IPFS proxy.
 *
 * Alongside the public URL we compute the file's SHA-256 in the browser (Web
 * Crypto) and return it, so the pinned metadata document can record a content
 * hash for integrity: anyone can re-fetch the object and confirm the bytes match
 * what the founder uploaded, independent of the CDN.
 */

export interface R2UploadResult {
  /** Public URL the object is served from (custom R2 domain). */
  url: string;
  /** Object key within the bucket. */
  key: string;
  /** Lowercase hex SHA-256 of the uploaded bytes. */
  hash: string;
}

/** Lowercase hex SHA-256 of a File via Web Crypto. */
async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface PresignResponse {
  uploadUrl?: string;
  publicUrl?: string;
  key?: string;
  error?: string;
  detail?: string;
}

/**
 * Upload one video directly to R2.
 *
 * `onProgress` is best-effort: driven by XHR upload events, which the fetch API
 * does not expose. A caller that needs a progress bar should pass an
 * XMLHttpRequest-based uploader instead.
 */
export async function uploadVideoToR2(
  file: File,
  options: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<R2UploadResult> {
  const contentType = file.type || 'video/mp4';

  const presignResponse = await fetch('/api/upload/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType, size: file.size }),
    signal: options.signal,
  });

  const presign = (await presignResponse.json().catch(() => ({}))) as PresignResponse;
  if (!presignResponse.ok || !presign.uploadUrl || !presign.publicUrl || !presign.key) {
    throw new Error(presign.error ?? `Presign failed (HTTP ${presignResponse.status})`);
  }

  // The signed PUT binds the content-type: sending a different value returns
  // 403 SignatureDoesNotMatch, so we reuse the exact string we declared.
  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
    signal: options.signal,
  });

  if (!put.ok) {
    const detail = await put.text().catch(() => '');
    throw new Error(`Direct upload failed (HTTP ${put.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }

  // Hash after a successful upload so a failed PUT never yields a stale record.
  const hash = await sha256Hex(file);
  options.onProgress?.(1);

  return { url: presign.publicUrl, key: presign.key, hash };
}
