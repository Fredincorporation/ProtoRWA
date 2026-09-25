/**
 * POST /api/upload/presign
 *
 * Mints a short-lived, single-object Cloudflare R2 upload URL for the founder
 * pitch video, so the bytes go browser -> bucket directly and never pass through
 * a serverless function. This is how we lift the 4.5 MB body cap that limits the
 * IPFS proxy (`/api/upload`) — large videos would otherwise fail with a 413.
 *
 * R2 presigned URLs are AWS SigV4 signatures over the bucket's S3 credentials
 * (Access Key ID + Secret Access Key). Signing happens here, server-side, so the
 * secret never reaches the browser, and the URL is bound to a key + content-type
 * we chose rather than one the caller supplies. The route therefore:
 *   - validates the declared content-type against a video allowlist,
 *   - validates the declared size against MAX_VIDEO_BYTES,
 *   - generates the object key itself (`p/<uuid>.<ext>`), ignoring any client
 *     filename, so callers cannot target or overwrite another object,
 *   - returns a PUT-only presigned URL that expires quickly.
 *
 * Request:  { contentType: string, size: number }
 * Response: { uploadUrl, publicUrl, key, expiresIn } | { error, detail? }
 *
 * Note on size: a presigned *PUT* cannot signature-bind content-length (only a
 * presigned POST policy can). The size check here uses the client's declared
 * value and is a guard, not hard enforcement; the authoritative limits are the
 * browser pre-check in studio/media-fields and R2's own object-size ceiling.
 */

import { NextResponse } from 'next/server';

import { presignR2Put } from '@/lib/r2-presign';
import { MAX_VIDEO_BYTES } from '@/lib/upload-limits';

export const runtime = 'nodejs';

/** Video MIME types we accept, mapped to the file extension we store them under. */
const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/** How long the minted PUT URL stays valid, in seconds. */
const PRESIGN_TTL_SECONDS = 300;

interface PresignBody {
  contentType?: unknown;
  size?: unknown;
}

export async function POST(request: Request) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET || process.env.NEXT_PUBLIC_R2_BUCKET;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const publicBaseUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    return NextResponse.json(
      { error: 'Direct video upload is not configured on this deployment.' },
      { status: 503 },
    );
  }

  let body: PresignBody;
  try {
    body = (await request.json()) as PresignBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const contentType =
    typeof body.contentType === 'string' ? body.contentType.trim().toLowerCase() : '';
  const ext = ALLOWED_VIDEO_TYPES[contentType];
  if (!ext) {
    return NextResponse.json(
      {
        error: 'Unsupported video type.',
        detail: `Allowed: ${Object.keys(ALLOWED_VIDEO_TYPES).join(', ')}`,
      },
      { status: 400 },
    );
  }

  const size = typeof body.size === 'number' ? Math.floor(body.size) : NaN;
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'A positive byte size is required' }, { status: 400 });
  }
  if (size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      {
        error: `Video is too large (${(size / 1024 / 1024).toFixed(1)} MB, limit ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB).`,
      },
      { status: 413 },
    );
  }

  // Server-generated key: uuid + whitelisted extension only. Never derived from
  // the client filename (avoids traversal / collisions / arbitrary keys).
  const key = `p/${crypto.randomUUID()}.${ext}`;

  let uploadUrl: string;
  try {
    uploadUrl = presignR2Put({
      accountId,
      bucket,
      accessKeyId,
      secretAccessKey,
      key,
      contentType,
      expiresIn: PRESIGN_TTL_SECONDS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Could not sign the upload URL', detail: message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    uploadUrl,
    publicUrl: `${publicBaseUrl.replace(/\/+$/, '')}/${key}`,
    key,
    expiresIn: PRESIGN_TTL_SECONDS,
  });
}
