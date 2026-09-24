// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Fixture } from "./Fixture.sol";
import { MilestoneEscrow } from "../src/MilestoneEscrow.sol";

/**
 * @title HardwareAttestationTest
 * @notice End-to-end proof that a hardware-gated milestone cannot open a review
 *         without a Merkle opening against the root the founder committed.
 *
 * The verifier here is `MockHardwareVerifier`, which replicates the deployed
 * Stylus `verify_hardware_batch` byte-for-byte (sorted-pair keccak), so a proof
 * that passes here is exactly one the WASM contract accepts on-chain. This is
 * the wiring that makes the escrow *call* the Stylus for its intended role
 * rather than merely predicting consensus in the UI.
 */
contract HardwareAttestationTest is Fixture {
    function _leaf(uint256 n) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("telemetry-", n));
    }

    /// @dev Sorted-pair keccak of two leaves -> their subtree root.
    function _root2(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a <= b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /// @dev Reaches IN_PRODUCTION, commits a two-leaf root, returns the opening.
    function _productionWithRoot()
        internal
        returns (uint256 projectId, bytes32 root, bytes32[] memory proof, bytes32 leaf)
    {
        projectId = fundedProject();

        // Two-leaf batch: leaf = _leaf(1), sibling = _leaf(2).
        leaf = _leaf(1);
        bytes32 sibling = _leaf(2);
        root = _root2(leaf, sibling);
        proof = new bytes32[](1);
        proof[0] = sibling;

        vm.prank(founder);
        escrow.setCommitment(projectId, 0, root);
    }

    function test_ValidProofOpensReviewAndAttests() public {
        (uint256 projectId, bytes32 root, bytes32[] memory proof, bytes32 leaf) =
            _productionWithRoot();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence", leaf, proof);

        MilestoneEscrow.Review memory review = escrow.getReview(projectId, 0);
        assertTrue(review.open, "review should be open");
        assertEq(escrow.committedRoots(projectId, 0), root);
        assertTrue(verifier.isTelemetryVerified(root), "verifier must record the attested root");
    }

    function test_BogusLeafRevertsAttestationFailed() public {
        (uint256 projectId,, bytes32[] memory proof,) = _productionWithRoot();

        bytes32 wrongLeaf = _leaf(999);
        vm.expectRevert(
            abi.encodeWithSelector(MilestoneEscrow.AttestationFailed.selector, projectId, 0)
        );
        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence", wrongLeaf, proof);
    }

    function test_WrongProofRevertsAttestationFailed() public {
        (uint256 projectId, bytes32 root, bytes32[] memory proof, bytes32 leaf) =
            _productionWithRoot();
        // Sanity: valid opening would pass.
        assertEq(root, _root2(leaf, proof[0]));

        bytes32[] memory badProof = new bytes32[](1);
        badProof[0] = _leaf(1234); // not the real sibling
        vm.expectRevert(
            abi.encodeWithSelector(MilestoneEscrow.AttestationFailed.selector, projectId, 0)
        );
        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence", leaf, badProof);
    }

    function test_NoCommitmentSkipsAttestation() public {
        // A milestone with no committed root behaves exactly like a
        // pre-attestation deployment, even when junk leaf/proof are supplied.
        uint256 projectId = fundedProject();
        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence", bytes32(uint256(0xdead)), new bytes32[](0));
        assertTrue(escrow.getReview(projectId, 0).open, "non-gated review still opens");
    }

    function test_CommitmentIsOneShot() public {
        (uint256 projectId, bytes32 root,,) = _productionWithRoot();
        vm.prank(founder);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.CommitmentLocked.selector, projectId, 0));
        escrow.setCommitment(projectId, 0, root);
    }

    function test_NonFounderCannotCommit() public {
        uint256 projectId = fundedProject();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.NotFound.selector, projectId));
        escrow.setCommitment(projectId, 0, _root2(_leaf(1), _leaf(2)));
    }
}
