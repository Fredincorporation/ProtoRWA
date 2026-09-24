/**
 * HardwareVerifier (Arbitrum Stylus / Rust → WASM) ABI.
 *
 * HAND-AUTHORED, not produced by `export-abis.mjs`: that generator reads the
 * Solidity build artifacts in `contracts/out`, and this contract is a Rust crate
 * at `contracts/stylus/hardware-verifier`, so no `.sol` artifact exists.
 *
 * The exported selectors are camelCase (`evaluateConsensus`, not the Rust
 * `evaluate_consensus`); calling the Rust spelling reverts with empty data.
 * Kept in sync with `contracts/stylus/hardware-verifier/src/lib.rs`.
 *
 * Only `evaluateConsensus` is used by the product today - as a live predictor of
 * the escrow's settlement decision. `verifyHardwareBatch` is the intended-but-
 * unwired Merkle attestation path (no on-chain caller yet), listed here so the
 * ABI matches what is actually deployed at the configured address.
 */

export const hardwareVerifierAbi = [
  {
    type: 'function',
    name: 'evaluateConsensus',
    stateMutability: 'view',
    inputs: [
      { name: 'milestoneId', type: 'uint256', internalType: 'uint256' },
      { name: 'approveWeight', type: 'uint256', internalType: 'uint256' },
      { name: 'rejectWeight', type: 'uint256', internalType: 'uint256' },
      { name: 'abstainWeight', type: 'uint256', internalType: 'uint256' },
      { name: 'eligibleWeight', type: 'uint256', internalType: 'uint256' },
      { name: 'minQuorumBps', type: 'uint256', internalType: 'uint256' },
      { name: 'passThresholdBps', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
  },
  {
    type: 'function',
    name: 'isTelemetryVerified',
    stateMutability: 'view',
    inputs: [{ name: 'root', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
  },
  {
    type: 'function',
    name: 'verifyHardwareBatch',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'projectHash', type: 'bytes32', internalType: 'bytes32' },
      { name: 'milestoneId', type: 'uint256', internalType: 'uint256' },
      { name: 'batchRoot', type: 'bytes32', internalType: 'bytes32' },
      { name: 'proof', type: 'bytes32[]', internalType: 'bytes32[]' },
      { name: 'leaf', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
  },
];
