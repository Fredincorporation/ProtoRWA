// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IHardwareVerifier } from "../../src/IHardwareVerifier.sol";

/**
 * @notice Test stand-in for the deployed Stylus HardwareVerifier.
 * @dev Reproduces `verify_hardware_batch` from
 *      `stylus/hardware-verifier/src/lib.rs` byte-for-byte: a sorted-pair
 *      keccak Merkle branch, so an escrow test that passes here proves the same
 *      proof the WASM verifier would accept. Consensus prediction mirrors
 *      `MilestoneEscrow.settleReview()` exactly, as the real verifier does.
 */
contract MockHardwareVerifier is IHardwareVerifier {
    mapping(bytes32 => bool) public verifiedTelemetryRoots;
    mapping(uint256 => bool) public milestonePassed;

    function verifyHardwareBatch(
        bytes32,
        uint256 milestoneId,
        bytes32 batchRoot,
        bytes32[] calldata proof,
        bytes32 leaf
    ) external override returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; ++i) {
            bytes32 sibling = proof[i];
            bytes32 combined = computed <= sibling
                ? keccak256(abi.encodePacked(computed, sibling))
                : keccak256(abi.encodePacked(sibling, computed));
            computed = combined;
        }

        bool isValid = computed == batchRoot;
        if (isValid) {
            verifiedTelemetryRoots[batchRoot] = true;
            milestonePassed[milestoneId] = true;
        }
        return isValid;
    }

    function isTelemetryVerified(bytes32 root) external view override returns (bool) {
        return verifiedTelemetryRoots[root];
    }

    function evaluateConsensus(
        uint256,
        uint256 approveWeight,
        uint256 rejectWeight,
        uint256 abstainWeight,
        uint256 eligibleWeight,
        uint256 minQuorumBps,
        uint256 passThresholdBps
    ) external pure override returns (bool) {
        if (eligibleWeight == 0) return false;
        uint256 cast = approveWeight + rejectWeight + abstainWeight;
        bool quorumMet = cast >= (eligibleWeight * minQuorumBps) / 10_000;
        bool approved =
            quorumMet && approveWeight >= (eligibleWeight * passThresholdBps) / 10_000;
        return approved;
    }
}
