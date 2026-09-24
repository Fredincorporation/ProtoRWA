import { describe, expect, it } from 'vitest';

import {
  ACCEPTED_EXTENSIONS,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_FILES,
  detectedCategories,
  fileExtension,
  formatBytes,
  intakeFiles,
  shortenDigest,
  totalBytes,
  validateFile,
  type EvidenceFile,
} from './evidence';

/**
 * The intake rules are the only thing standing between a founder and submitting
 * a 4 GB video as "QA certification", so they are tested directly rather than
 * only through the form.
 *
 * `intakeFiles` takes real `File` objects. Node 20+ provides `File` globally, and
 * `crypto.subtle` with it, so no DOM shim is needed here.
 */

/**
 * Builds a File of approximately `bytes` size.
 *
 * The filler defaults to the filename rather than a constant, so two files built
 * with the same byte count do not accidentally produce identical digests - which
 * the duplicate-content rule would then reject, making a passing test fail.
 */
function makeFile(name: string, bytes: number, contents = name): File {
  // A zero-byte request must produce a genuinely empty File, or the empty-file
  // rule never fires and the fixture silently tests something else.
  if (bytes === 0) return new File([], name);
  return new File([contents.repeat(Math.max(1, Math.ceil(bytes / contents.length)))], name);
}

describe('fileExtension', () => {
  it('lowercases and includes the dot', () => {
    expect(fileExtension('QA-Report.PDF')).toBe('.pdf');
  });

  it('returns empty for a name with no extension', () => {
    expect(fileExtension('evidence')).toBe('');
  });

  it('uses only the final dot', () => {
    expect(fileExtension('batch.12.results.csv')).toBe('.csv');
  });
});

describe('formatBytes', () => {
  it('scales to the unit a human would use', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('validateFile', () => {
  it('accepts a normal PDF', () => {
    expect(validateFile({ name: 'qa.pdf', size: 1024 })).toBeNull();
  });

  it('rejects an empty file', () => {
    expect(validateFile({ name: 'qa.pdf', size: 0 })).toMatch(/empty/i);
  });

  it('rejects a file over the per-file limit and names both sizes', () => {
    const problem = validateFile({ name: 'big.mp4', size: MAX_EVIDENCE_BYTES + 1 });
    expect(problem).toContain('MB');
    expect(problem).toMatch(/limit/i);
  });

  it('rejects an extension outside the allowlist', () => {
    // .exe is the case an allowlist exists for; a blocklist would miss .bat.
    expect(validateFile({ name: 'payload.exe', size: 1024 })).toMatch(/not an accepted/i);
  });

  it('rejects a file with no extension because its type cannot be verified', () => {
    expect(validateFile({ name: 'evidence', size: 1024 })).toMatch(/no extension/i);
  });

  it('accepts every extension on the allowlist', () => {
    for (const extension of ACCEPTED_EXTENSIONS) {
      expect(validateFile({ name: `evidence${extension}`, size: 512 })).toBeNull();
    }
  });
});

describe('intakeFiles', () => {
  it('accepts valid files and records their metadata', async () => {
    const result = await intakeFiles([makeFile('qa.pdf', 100)], []);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
    expect(result.accepted[0]!.extension).toBe('.pdf');
    expect(result.accepted[0]!.category).toBe('qa');
  });

  it('computes a real SHA-256 digest distinct per content', async () => {
    const a = await intakeFiles([makeFile('a.csv', 64, 'alpha')], []);
    const b = await intakeFiles([makeFile('b.csv', 64, 'beta')], []);
    expect(a.accepted[0]!.digest).not.toBe(b.accepted[0]!.digest);
    expect(a.accepted[0]!.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a file already attached under the same name', async () => {
    const existing = (await intakeFiles([makeFile('qa.pdf', 100)], [])).accepted;
    const result = await intakeFiles([makeFile('qa.pdf', 100)], existing);
    expect(result.rejected[0]!.reason).toMatch(/already attached/i);
  });

  it('rejects identical contents under a different filename', async () => {
    const existing = (await intakeFiles([makeFile('qa.pdf', 64, 'same-bytes')], [])).accepted;
    const result = await intakeFiles([makeFile('copy.pdf', 64, 'same-bytes')], existing);
    expect(result.rejected[0]!.reason).toMatch(/identical contents/i);
  });

  it('reports every rejection at once rather than failing on the first', async () => {
    // Retrying a whole selection to discover the next bad file is the behaviour
    // this prevents.
    const result = await intakeFiles(
      [makeFile('bad.exe', 100), makeFile('good.pdf', 100), makeFile('empty.pdf', 0)],
      [],
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
  });

  it('enforces the artefact count limit', async () => {
    const existing: EvidenceFile[] = Array.from({ length: MAX_EVIDENCE_FILES }, (_, i) => ({
      id: `e${i}`,
      name: `existing-${i}.pdf`,
      size: 10,
      type: 'application/pdf',
      extension: '.pdf',
      digest: `digest-${i}`,
      category: 'qa',
      file: makeFile(`existing-${i}.pdf`, 10),
    }));

    const result = await intakeFiles([makeFile('extra.pdf', 10)], existing);
    expect(result.rejected[0]!.reason).toMatch(new RegExp(`${MAX_EVIDENCE_FILES}`));
  });

  it('classifies common artefacts into checklist categories', async () => {
    const result = await intakeFiles(
      [
        makeFile('bom.csv', 64, 'a'),
        makeFile('photo.png', 64, 'b'),
        makeFile('thermal.txt', 64, 'c'),
      ],
      [],
    );
    const categories = new Set(result.accepted.map((f) => f.category));
    expect(categories.has('bom')).toBe(true);
    expect(categories.has('photos')).toBe(true);
    expect(categories.has('evtDvt')).toBe(true);
  });
});

describe('detectedCategories', () => {
  it('omits unclassified files so they cannot tick a checklist item', async () => {
    const result = await intakeFiles([makeFile('readme.md', 64, 'notes')], []);
    expect(result.accepted[0]!.category).toBe('unclassified');
    expect(detectedCategories(result.accepted).size).toBe(0);
  });
});

describe('totalBytes', () => {
  it('sums sizes across artefacts', async () => {
    const result = await intakeFiles(
      [makeFile('a.pdf', 100, 'a'), makeFile('b.pdf', 200, 'b')],
      [],
    );
    expect(totalBytes(result.accepted)).toBeGreaterThan(0);
  });

  it('is zero for an empty package', () => {
    expect(totalBytes([])).toBe(0);
  });
});

describe('shortenDigest', () => {
  it('abbreviates a real digest without inventing one', () => {
    const fake = 'a'.repeat(64);
    expect(shortenDigest(fake)).toBe(`${'a'.repeat(10)}…${'a'.repeat(6)}`);
  });

  it('states plainly when the digest is unavailable', () => {
    expect(shortenDigest('unavailable')).toBe('digest unavailable');
  });
});
