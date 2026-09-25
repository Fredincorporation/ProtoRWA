/**
 * POST /api/upload
 *
 * Server-side IPFS pinning proxy for the founder studio's media step, backed by
 * Filebase's IPFS RPC API. The bucket-scoped token stays on the server: the
 * browser posts the raw file (or a metadata JSON blob) here and receives a CID
 * back.
 *
 * Request: multipart/form-data with a single `file` field (optionally `name`).
 * Response: { cid, url } on success, { error, detail? } otherwise.
 *
 * Filebase's IPFS RPC API (https://rpc.filebase.io/api/v0/add) is a
 * Kubo-compatible endpoint authenticated with `Authorization: Bearer <token>`,
 * where the token is generated per-bucket in the Filebase console. It returns a
 * CIDv1 `Hash`, which is what the registry stores on-chain and what the gateway
 * renders from. (S3-compatible access does not work for IPFS-mode buckets.)
 */

import { NextResponse } from 'next/server';

import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '@/lib/upload-limits';

export const runtime = 'nodejs';

/**
 * Single-file cap. Must stay under the platform's serverless request-body limit
 * (4.5 MB on Vercel) because the file is proxied through this function. The
 * value and its rationale live in `@/lib/upload-limits` (env-overridable via
 * MAX_UPLOAD_BYTES). To accept larger media on a body-capped host you must move
 * to a presigned direct-to-bucket upload — but that returns an object-store URL,
 * not an IPFS CID, so it is a media-model change, not a drop-in.
 */

/** Public Filebase IPFS gateway used for rendering pinned content. */
const GATEWAY = 'https://ipfs.filebase.io/ipfs';

/** Kubo-compatible add endpoint. Overridable if Filebase moves hosts. */
const ADD_ENDPOINT =
  process.env.FILEBASE_IPFS_ENDPOINT || 'https://rpc.filebase.io/api/v0/add';

/**
 * Parse a Kubo `/api/v0/add` response, which is newline-delimited JSON with one
 * object per added node. For a single file the final object carries the root
 * CID. Older builds expose `Hash`; newer ones may only populate `Cid['/']`.
 */
function parseCid(raw: string): string | null {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let obj: { Hash?: string; Cid?: { '/': string } | string };
    try {
      obj = JSON.parse(lines[i]!);
    } catch {
      continue;
    }
    const cid =
      (typeof obj.Hash === 'string' && obj.Hash) ||
      (typeof obj.Cid === 'string' && obj.Cid) ||
      (obj.Cid && typeof obj.Cid === 'object' && obj.Cid['/']) ||
      '';
    if (cid) return cid;
  }
  return null;
}

export async function POST(request: Request) {
  const token = process.env.FILEBASE_IPFS_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        error:
          'IPFS pinning is not configured on this deployment (missing FILEBASE_IPFS_TOKEN).',
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'Expected multipart/form-data with a `file` field' },
      { status: 400 },
    );
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB, limit ${MAX_UPLOAD_MB} MB).`,
        detail:
          'Uploads are proxied through a serverless function, which caps the request body. Use a smaller file, or switch media hosting to a presigned direct-to-bucket upload.',
      },
      { status: 413 },
    );
  }

  const name = typeof form.get('name') === 'string' ? (form.get('name') as string) : file.name;

  const upstreamForm = new FormData();
  upstreamForm.append(
    'file',
    new Blob([Buffer.from(await file.arrayBuffer())], { type: file.type || 'application/octet-stream' }),
    name,
  );

  let upstream: Response;
  try {
    upstream = await fetch(`${ADD_ENDPOINT}?pin=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: upstreamForm,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Could not reach Filebase IPFS API', detail: message },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    const denied = /401|403|Unauthorized|api key|AccessDenied/i.test(`${upstream.status} ${text}`);
    return NextResponse.json(
      {
        error: denied
          ? 'Filebase rejected the IPFS token (check FILEBASE_IPFS_TOKEN — tokens are bucket-scoped and short-lived).'
          : 'Filebase upload failed',
        detail: text.slice(0, 500),
      },
      { status: denied ? 403 : 502 },
    );
  }

  const cid = parseCid(text);
  if (!cid) {
    return NextResponse.json(
      { error: 'Filebase returned no IPFS CID.', detail: text.slice(0, 500) },
      { status: 502 },
    );
  }

  return NextResponse.json({ cid, url: `${GATEWAY}/${cid}` });
}
