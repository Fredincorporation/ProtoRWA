# Hardware Verifier — Arbitrum Stylus Contract

This contract executes as WebAssembly (WASM) on the **Arbitrum Nitro / Stylus** runtime.

## Key Capabilities
1. **High-Performance Merkle Batch Verification (`verify_hardware_batch`)**:
   * Verifies cryptographic Merkle proofs for bill-of-materials components, factory sensor logs, and lab compliance test hashes.
   * Runs in Stylus at near C/Rust native speed with ~10x-50x less gas than standard EVM opcode loops.
2. **Deterministic Token-Weighted Quorum Evaluation (`evaluate_consensus`)**:
   * Evaluates backer vote consensus for milestone escrow releases.
   * Computes precise basis points (`bps`) without overflow risk using `alloy_primitives::U256`.

## ABI Interface (Solidity Equivalent)
```solidity
interface IHardwareVerifier {
    function init(address initialAdmin) external;
    function verifyHardwareBatch(
        bytes32 projectHash,
        uint256 milestoneId,
        bytes32 batchRoot,
        bytes32[] calldata proof,
        bytes32 leaf
    ) external returns (bool);
    function evaluateConsensus(
        uint256 milestoneId,
        uint256 approveWeight,
        uint256 rejectWeight,
        uint256 eligibleWeight,
        uint256 minQuorumBps,
        uint256 passThresholdBps
    ) external returns (bool);
    function isTelemetryVerified(bytes32 root) external view returns (bool);
}
```
