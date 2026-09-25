/**
 * Upload size ceilings, shared by the client pre-check and the server routes so
 * the two never drift.
 *
 * Vercel (and most serverless platforms) cap a function's *request body* at
 * 4.5 MB, rejecting anything larger with `413 Payload Too Large` before our
 * route ever runs. `/api/upload` proxies bytes to Filebase server-side (the
 * pinning token must never reach the browser), so the file has to fit inside
 * that body limit. 4 MB leaves headroom for the multipart envelope.
 *
 * Overridable per-deployment via MAX_UPLOAD_BYTES (e.g. a self-hosted Node
 * server has no body cap). To lift the ceiling on Vercel without a cap you must
 * move media to a presigned direct-to-bucket flow — see the note in
 * app/api/upload/route.ts.
 */
const DEFAULT_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function readMax(): number {
  const raw = process.env.MAX_UPLOAD_BYTES;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_BYTES;
}

export const MAX_UPLOAD_BYTES = readMax();

/** Human-readable MB figure for error copy (rounded to whole MB). */
export const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);

/**
 * Pitch-video ceiling for the R2 direct-upload path (see
 * app/api/upload/presign/route.ts).
 *
 * Unlike the IPFS proxy, the video bytes never traverse a serverless function:
 * the browser PUTs them straight to the bucket through a presigned URL, so the
 * only real limit is the one we choose to enforce server-side when minting the
 * URL (via the presign policy's `content-length-range`). 512 MB is generous for
 * a founder pitch clip while still bounding storage abuse. Overridable per
 * deployment via MAX_VIDEO_BYTES.
 */
const DEFAULT_MAX_VIDEO_BYTES = 512 * 1024 * 1024;

function readVideoMax(): number {
  const raw = process.env.MAX_VIDEO_BYTES;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_VIDEO_BYTES;
}

export const MAX_VIDEO_BYTES = readVideoMax();

/** Human-readable MB figure for the video field copy (rounded to whole MB). */
export const MAX_VIDEO_MB = Math.round(MAX_VIDEO_BYTES / 1024 / 1024);

/**
 * Whether the R2 direct-upload path is available on this deployment. Reads only
 * public env (the same values the browser needs), so client and server agree.
 * When false the pitch-video field falls back to the IPFS proxy (small files
 * only) rather than breaking the wizard.
 */
export const R2_VIDEO_ENABLED = Boolean(
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL && process.env.NEXT_PUBLIC_R2_BUCKET,
);
