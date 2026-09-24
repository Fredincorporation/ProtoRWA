/**
 * Evidence file intake for the Founder Milestone Evidence Studio.
 *
 * Why this exists
 * ---------------
 * The submission form originally asked the founder to paste an IPFS CID by hand.
 * That is not an upload: it assumes the user has already pinned the artefact
 * somewhere, gives no feedback about what was actually attached, and cannot tell
 * a QA certificate from a screenshot. It also made the checklist pointless, since
 * nothing tied those tick-boxes to real files.
 *
 * This module does the client-side half of a real upload: validate what the user
 * selected, compute a content digest so the same bytes can be recognised again,
 * and produce the metadata the submission would carry.
 *
 * What it deliberately does NOT do
 * --------------------------------
 * It does not pretend to upload to IPFS. Pinning needs a server-side credential,
 * and fabricating a CID from a local file would produce an identifier that
 * resolves to nothing - exactly the kind of plausible-looking fake this codebase
 * has been removing elsewhere. The digest below is a real SHA-256 of the file,
 * labelled as a local digest, and the UI states that pinning is not wired up.
 */

/** Maximum size per artefact. 25 MiB: bigger than any plausible QA PDF. */
export const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;

/** Total budget across all artefacts in one submission. */
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

/** Maximum number of artefacts in one evidence package. */
export const MAX_EVIDENCE_FILES = 12;

/**
 * Accepted artefact types, by extension.
 *
 * An allowlist rather than a blocklist, and checked against the extension as well
 * as the MIME type: browsers derive `File.type` from the extension anyway, so a
 * renamed executable can still claim `application/pdf`. Neither check is a
 * substitute for server-side validation - see `describeIntakeLimits`.
 */
export const ACCEPTED_EXTENSIONS = [
  '.pdf',
  '.csv',
  '.json',
  '.txt',
  '.md',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.zip',
  '.car',
  '.mp4',
  '.mov',
] as const;

/** `accept` attribute for the file input, derived from the allowlist. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',');

/** Which checklist category an extension most likely belongs to. */
export type EvidenceCategory = 'bom' | 'qa' | 'evtDvt' | 'photos' | 'inspection' | 'unclassified';

const categoryByExtension: Record<string, EvidenceCategory> = {
  '.csv': 'bom',
  '.json': 'bom',
  '.zip': 'bom',
  '.car': 'bom',
  '.pdf': 'qa',
  '.mp4': 'photos',
  '.mov': 'photos',
  '.png': 'photos',
  '.jpg': 'photos',
  '.jpeg': 'photos',
  '.webp': 'photos',
  '.txt': 'evtDvt',
  '.md': 'unclassified',
};

export interface EvidenceFile {
  /** Stable local id, so React keys survive re-selection. */
  id: string;
  name: string;
  /** Size in bytes. */
  size: number;
  /** MIME type as reported by the browser (extension-derived). */
  type: string;
  /** Lowercased extension including the dot. */
  extension: string;
  /** SHA-256 of the file contents, hex. A real digest of the real bytes. */
  digest: string;
  /** Best-guess checklist category, used to pre-tick the checklist. */
  category: EvidenceCategory;
  /** The underlying File, retained so it can be sent once pinning is wired up. */
  file: File;
}

export interface RejectedFile {
  name: string;
  reason: string;
}

export interface IntakeResult {
  accepted: EvidenceFile[];
  rejected: RejectedFile[];
}

/** Lowercased extension of a filename, including the leading dot. */
export function fileExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index).toLowerCase();
}

/** Human-readable byte size, e.g. "2.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validates a single file against the intake rules.
 *
 * Returns a reason string when rejected, or null when acceptable. Kept separate
 * from the digest computation so validation can be unit-tested without a
 * filesystem or a crypto implementation.
 */
export function validateFile(file: { name: string; size: number }): string | null {
  if (file.size === 0) return 'File is empty.';
  if (file.size > MAX_EVIDENCE_BYTES) {
    return `File is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_EVIDENCE_BYTES)}.`;
  }

  const extension = fileExtension(file.name);
  if (extension === '') return 'File has no extension, so its type cannot be verified.';
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) {
    return `${extension} is not an accepted evidence format.`;
  }

  return null;
}

/**
 * Computes a SHA-256 digest of a file's bytes.
 *
 * Uses WebCrypto. `crypto.subtle` is unavailable in a non-secure context (plain
 * HTTP on a non-localhost origin), which is a real deployment constraint rather
 * than an edge case, so the failure is surfaced as a value instead of a throw.
 */
export async function digestFile(file: File): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Callers render this verbatim; it must read as a state, not an error code.
    return 'unavailable';
  }
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Processes a selection into accepted artefacts and rejections.
 *
 * Rejections are returned rather than thrown so the UI can list every problem at
 * once. Failing on the first bad file makes the user retry the whole selection to
 * discover the next one.
 */
export async function intakeFiles(
  incoming: File[],
  existing: EvidenceFile[],
): Promise<IntakeResult> {
  const accepted: EvidenceFile[] = [];
  const rejected: RejectedFile[] = [];

  const seenNames = new Set(existing.map((item) => item.name.toLowerCase()));
  const seenDigests = new Set(existing.map((item) => item.digest));

  let runningTotal = existing.reduce((acc, item) => acc + item.size, 0);

  for (const file of incoming) {
    // A file already attached under the same name is almost always a slip.
    if (seenNames.has(file.name.toLowerCase())) {
      rejected.push({ name: file.name, reason: 'Already attached.' });
      continue;
    }

    const problem = validateFile(file);
    if (problem) {
      rejected.push({ name: file.name, reason: problem });
      continue;
    }

    if (existing.length + accepted.length >= MAX_EVIDENCE_FILES) {
      rejected.push({
        name: file.name,
        reason: `Package is limited to ${MAX_EVIDENCE_FILES} artefacts.`,
      });
      continue;
    }

    if (runningTotal + file.size > MAX_TOTAL_BYTES) {
      rejected.push({
        name: file.name,
        reason: `Would exceed the ${formatBytes(MAX_TOTAL_BYTES)} package limit.`,
      });
      continue;
    }

    const digest = await digestFile(file);

    /*
     * Identical bytes under a different filename is a duplicate submission. The
     * digest is only trusted when it was actually computed - an 'unavailable'
     * digest from a non-secure context would make every file look identical.
     */
    if (digest !== 'unavailable' && seenDigests.has(digest)) {
      rejected.push({ name: file.name, reason: 'Identical contents already attached.' });
      continue;
    }

    runningTotal += file.size;
    seenNames.add(file.name.toLowerCase());
    if (digest !== 'unavailable') seenDigests.add(digest);

    accepted.push({
      id: `${file.name}-${file.size}-${accepted.length}`,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      extension: fileExtension(file.name),
      digest,
      category: categoryByExtension[fileExtension(file.name)] ?? 'unclassified',
      file,
    });
  }

  return { accepted, rejected };
}

/** Total bytes across attached artefacts. */
export function totalBytes(files: EvidenceFile[]): number {
  return files.reduce((acc, file) => acc + file.size, 0);
}

/**
 * Which checklist items the attached files satisfy.
 *
 * The checklist used to be five independent tick-boxes with no connection to
 * anything. Tying them to detected categories means the ticks reflect what was
 * actually attached, while still allowing a manual override for the categories a
 * file extension cannot reveal (an inspection report is a PDF like any other).
 */
export function detectedCategories(files: EvidenceFile[]): Set<EvidenceCategory> {
  return new Set(files.map((file) => file.category).filter((c) => c !== 'unclassified'));
}

/** A short, stable display form of a digest. */
export function shortenDigest(digest: string): string {
  if (digest === 'unavailable') return 'digest unavailable';
  return `${digest.slice(0, 10)}…${digest.slice(-6)}`;
}

/**
 * The intake limits, phrased for the UI.
 *
 * Returns prose rather than a schema so the form and any error message quote the
 * same numbers; hardcoding them in two places is how a limit drifts.
 */
export function describeIntakeLimits(): string {
  return `Up to ${MAX_EVIDENCE_FILES} files, ${formatBytes(MAX_EVIDENCE_BYTES)} each and ${formatBytes(
    MAX_TOTAL_BYTES,
  )} total. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}.`;
}
