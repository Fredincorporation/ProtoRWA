/**
 * Server-only R2 presigned-PUT signer (AWS Signature V4, query-string auth).
 *
 * Cloudflare R2 exposes an S3-compatible API; presigned upload URLs are produced
 * by signing a `PUT` request with SigV4 using the bucket's Access Key ID + Secret
 * Access Key (R2 dashboard > Manage R2 API Tokens > Object Read & Write). There
 * is no Cloudflare REST "presign" endpoint, so we sign here in Node and hand the
 * browser a URL it can PUT bytes to directly.
 *
 * The signature binds the request `Content-Type` (via SignedHeaders), so the
 * client must send the exact same header or R2 returns 403 SignatureDoesNotMatch.
 * The payload is UNSIGNED-PAYLOAD: a presigned PUT does not hash the body, which
 * is why we cannot enforce object size in the signature itself.
 */

import { createHash, createHmac } from 'node:crypto';

const REGION = 'auto'; // R2's fixed SigV4 region.
const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';

/** RFC 3986 percent-encoding as AWS requires (encodeURIComponent + the extras). */
function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export interface PresignedPutInput {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Object key, e.g. `p/<uuid>.mp4`. */
  key: string;
  /** Content-Type the client must send on the PUT. */
  contentType: string;
  /** URL lifetime in seconds. */
  expiresIn: number;
}

/** Build a SigV4 presigned PUT URL for an R2 object (path-style addressing). */
export function presignR2Put(input: PresignedPutInput): string {
  const host = `${input.accountId}.r2.cloudflarestorage.com`;
  // Path-style addressing: the canonical URI is /<bucket>/<key>.
  const canonicalPath = '/' + [input.bucket, ...input.key.split('/')].map(uriEncode).join('/');

  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;

  const query: Record<string, string> = {
    'X-Amz-Algorithm': ALGORITHM,
    'X-Amz-Credential': `${input.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(input.expiresIn),
    'X-Amz-SignedHeaders': 'content-type;host',
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k]!)}`)
    .join('&');

  // Canonical headers sorted by name, each terminated by \n.
  const canonicalHeaders = `content-type:${input.contentType}\nhost:${host}\n`;

  const canonicalRequest = [
    'PUT',
    canonicalPath,
    canonicalQuery,
    canonicalHeaders,
    'content-type;host', // signed headers list
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [ALGORITHM, amzDate, credentialScope, sha256(canonicalRequest)].join('\n');

  const kDate = hmac('AWS4' + input.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  return `https://${host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
