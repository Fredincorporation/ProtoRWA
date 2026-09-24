/**
 * Merkle tree over evidence artefact digests, matching the Stylus verifier.
 *
 * The deployed `HardwareVerifier.verify_hardware_batch` recomputes a root from a
 * leaf and its branch using *sorted-pair* keccak: each parent is
 * `keccak(min(a,b) ‖ max(a,b))`. The escrow gates a hardware milestone on that
 * exact check, so the proof the browser builds has to be produced the same way or
 * the on-chain call reverts. This module is the client mirror of
 * `contracts/stylus/hardware-verifier/src/lib.rs`.
 *
 * Leaves are the SHA-256 digests of the uploaded artefacts (already 32 bytes),
 * so the batch root commits to the precise bytes of every file in the package.
 * A valid opening for one artefact proves the package is the one the founder
 * pre-committed - which is what the escrow enforces.
 */
import { keccak256, type Hex } from 'viem';

const ZERO32 = `0x${'00'.repeat(32)}` as const;

/** A SHA-256 hex digest (no 0x) -> a bytes32 leaf. Zero when a digest is absent. */
export function digestToLeaf(digest: string | undefined): Hex {
  if (!digest || digest === 'unavailable' || digest.length !== 64) return ZERO32;
  return `0x${digest}`;
}

/** Sorted-pair keccak: the exact combine the Rust verifier performs. */
function combine(a: Hex, b: Hex): Hex {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return keccak256(`0x${lo.slice(2)}${hi.slice(2)}`);
}

/**
 * One level up: pairs the level, duplicating the final node when the count is
 * odd. Duplication (rather than self-pairing) keeps every proof free of the
 * degenerate self-sibling case.
 */
function parentLevel(level: Hex[]): Hex[] {
  if (level.length <= 1) return level;
  const children = level.length % 2 === 0 ? level : [...level, level[level.length - 1]!];
  const next: Hex[] = [];
  for (let i = 0; i < children.length; i += 2) {
    next.push(combine(children[i]!, children[i + 1]!));
  }
  return next;
}

/** Batch root over the given leaves (the empty set hashes to zero). */
export function batchRoot(leaves: Hex[]): Hex {
  if (leaves.length === 0) return ZERO32;
  if (leaves.length === 1) return leaves[0]!;
  let level = leaves;
  while (level.length > 1) level = parentLevel(level);
  return level[0]!;
}

/** Merkle branch proving `leafIndex` is a member of the tree over `leaves`. */
export function proofFor(leaves: Hex[], leafIndex: number): Hex[] {
  const proof: Hex[] = [];
  let level = leaves;
  let idx = leafIndex;
  while (level.length > 1) {
    const children = level.length % 2 === 0 ? level : [...level, level[level.length - 1]!];
    proof.push(children[idx % 2 === 0 ? idx + 1 : idx - 1]!);
    level = parentLevel(children);
    idx = Math.floor(idx / 2);
  }
  return proof;
}

/**
 * Root plus a valid (leaf, proof) opening for the first artefact.
 *
 * A single opening satisfies the verifier's membership check, and every leaf
 * contributes to the root, so committing to it binds the whole package.
 */
export function buildBatchProof(digests: string[]): { root: Hex; leaf: Hex; proof: Hex[] } {
  const leaves = digests.map(digestToLeaf);
  return {
    root: batchRoot(leaves),
    leaf: leaves[0] ?? ZERO32,
    proof: leaves.length > 0 ? proofFor(leaves, 0) : [],
  };
}
