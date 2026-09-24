import { describe, expect, it } from 'vitest';
import { keccak256, type Hex } from 'viem';

import { batchRoot, buildBatchProof, digestToLeaf, proofFor } from './merkle';

/** Independent sorted-pair keccak recompute — the verifier's own algorithm. */
function combine(a: Hex, b: Hex): Hex {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return keccak256(`0x${lo.slice(2)}${hi.slice(2)}`);
}

/** Recompute a root from a leaf and its branch, exactly as Stylus does. */
function recomputeRoot(leaf: Hex, proof: Hex[]): Hex {
  return proof.reduce((acc, sibling) => combine(acc, sibling), leaf);
}

const LEAVES: Hex[] = [1, 2, 3, 4, 5].map(
  (n) => `0x${n.toString(16).padStart(64, '0')}` as Hex,
);

describe('merkle (Stylus parity)', () => {
  it('treats a single leaf as its own root with an empty proof', () => {
    const one = [LEAVES[0]!];
    expect(batchRoot(one)).toBe(LEAVES[0]);
    expect(proofFor(one, 0)).toEqual([]);
  });

  it('produces a branch that recomputes to the batch root for every leaf', () => {
    const root = batchRoot(LEAVES);
    LEAVES.forEach((leaf, i) => {
      const proof = proofFor(LEAVES, i);
      expect(recomputeRoot(leaf, proof)).toBe(root);
    });
  });

  it('rejects a tampered leaf', () => {
    const proof = proofFor(LEAVES, 0);
    const tampered = `0x${'ff'.repeat(32)}` as Hex;
    expect(recomputeRoot(tampered, proof)).not.toBe(batchRoot(LEAVES));
  });

  it('rejects a wrong sibling in the branch', () => {
    const proof = proofFor(LEAVES, 0);
    const bad = [...proof];
    bad[0] = `0x${'ab'.repeat(32)}` as Hex;
    expect(recomputeRoot(LEAVES[0]!, bad)).not.toBe(batchRoot(LEAVES));
  });

  it('maps a real sha-256 digest to a bytes32 leaf', () => {
    const digest = 'a'.repeat(64);
    expect(digestToLeaf(digest)).toBe(`0x${digest}`);
    expect(digestToLeaf('unavailable')).toBe(`0x${'00'.repeat(32)}`);
    expect(digestToLeaf(undefined)).toBe(`0x${'00'.repeat(32)}`);
  });

  it('buildBatchProof returns an opening consistent with the root', () => {
    const digests = ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64)];
    const { root, leaf, proof } = buildBatchProof(digests);
    expect(leaf).toBe(digestToLeaf(digests[0]));
    expect(recomputeRoot(leaf, proof)).toBe(root);
  });
});
