/**
 * Client-side IPFS helpers.
 *
 * The browser never talks to web3.storage directly (that would leak the pinning
 * token); it posts to `/api/upload`, which proxies the bytes server-side and
 * returns a CID. This module turns that CID into a gateway URL and uploads the
 * project metadata JSON that the registry stores as `metadataCid`.
 */

/** Public gateway used for rendering pinned content (Filebase IPFS gateway). */
const GATEWAY = 'https://ipfs.filebase.io/ipfs';

/**
 * Build a resolvable URL from a CID. Accepts a bare CID (`bafy…`) or one that
 * already carries an `ipfs://` / gateway prefix, so stored values render the
 * same way regardless of how they were recorded.
 */
export function ipfsUrl(cid: string | null | undefined): string | null {
  if (!cid) return null;
  if (cid.startsWith('http://') || cid.startsWith('https://')) return cid;
  const bare = cid.replace(/^ipfs:\/\//, '').replace(/^\/+/, '');
  if (!bare) return null;
  return `${GATEWAY}/${bare}`;
}

/** Canonical `ipfs://` reference for a bare CID, used inside metadata docs. */
export function ipfsRef(cid: string): string {
  return `ipfs://${cid}`;
}

export interface UploadResult {
  cid: string;
  url: string;
}

/**
 * Upload one file through the server proxy.
 *
 * `onProgress` is a best-effort indicator driven by the underlying fetch; a
 * browser without upload-progress support simply never calls it.
 */
export async function uploadFile(
  file: File,
  options: { signal?: AbortSignal } = {},
): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('name', file.name);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: form,
    signal: options.signal,
  });

  const payload = (await response.json().catch(() => ({}))) as UploadResult & {
    error?: string;
    detail?: string;
  };

  if (!response.ok || !payload.cid) {
    throw new Error(payload.error ?? `Upload failed (HTTP ${response.status})`);
  }

  return { cid: payload.cid, url: payload.url };
}

/**
 * Pin the project metadata document and return its CID.
 *
 * Mirrors the IPFS metadata conventions (name / description / image / gallery /
 * video) so a gateway or IPFS-native client can render the project without the
 * app. The JSON is uploaded as a file through the same proxy.
 */
export async function pinProjectMetadata(metadata: {
  name: string;
  description: string;
  image?: string | null;
  gallery?: string[];
  video?: string | null;
}): Promise<UploadResult> {
  const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
  const file = new File([blob], 'metadata.json', { type: 'application/json' });
  return uploadFile(file);
}

/**
 * Pin a founder update body and return its CID.
 *
 * Mirrors the `UpdateDoc` shape the data layer resolves, so the contract only
 * stores this CID and the text renders from the gateway. Attachments are CIDs of
 * already-pinned media (pass the `uploadFile` results), not re-uploaded bytes.
 */
export async function pinUpdateDoc(doc: {
  title: string;
  body: string;
  attachmentCids?: string[];
}): Promise<UploadResult> {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const file = new File([blob], 'update.json', { type: 'application/json' });
  return uploadFile(file);
}

/** Pin a founder profile doc (display name / bio / avatar CID) and return its CID. */
export async function pinProfileDoc(doc: {
  displayName: string;
  handle?: string;
  bio?: string;
  avatarCid?: string | null;
}): Promise<UploadResult> {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const file = new File([blob], 'profile.json', { type: 'application/json' });
  return uploadFile(file);
}
