// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IHardwareVerifier
 * @notice Solidity view of the deployed Arbitrum Stylus `HardwareVerifier`.
 *
 * The verifier is a Rust/WASM contract, not Solidity, but the Stylus runtime
 * exposes its methods under standard 4-byte selectors, so an EVM contract can
 * call it through this interface exactly as it would call a Solidity one.
 *
 * Selector casing is load-bearing. The Stylus SDK exports the Rust snake_case
 * names as camelCase selectors (`verify_hardware_batch` ->
 * `verifyHardwareBatch`). Declaring anything other than the camelCase spelling
 * here hits an unknown selector and reverts with empty data, which is
 * indistinguishable on the client from a dead contract.
 */
interface IHardwareVerifier {
    /**
     * @notice Verifies a Merkle proof that `leaf` is a member of `batchRoot`.
     * @dev Returns true only when recomputing the root from `leaf` and `proof`
     *      reproduces `batchRoot`. On success the verifier records the root as
     *      attested. The escrow passes its own committed root as `batchRoot`, so
     *      a `true` return is proof that the founder holds a valid opening
     *      against the root they committed before the review opened.
     */
    function verifyHardwareBatch(
        bytes32 projectHash,
        uint256 milestoneId,
        bytes32 batchRoot,
        bytes32[] calldata proof,
        bytes32 leaf
    ) external returns (bool);

    /// @notice Whether `root` has already been attested by a successful batch check.
    function isTelemetryVerified(bytes32 root) external view returns (bool);

    /**
     * @notice Predicts a milestone review outcome from vote weights.
     * @dev Mirrors `MilestoneEscrow.settleReview()` exactly. Used by the UI and
     *      oracle to read the same answer the escrow would produce; it moves no
     *      funds and gates nothing on its own.
     */
    function evaluateConsensus(
        uint256 milestoneId,
        uint256 approveWeight,
        uint256 rejectWeight,
        uint256 abstainWeight,
        uint256 eligibleWeight,
        uint256 minQuorumBps,
        uint256 passThresholdBps
    ) external view returns (bool);
}
