// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Fixture } from "./Fixture.sol";
import { ProjectRegistry } from "../src/ProjectRegistry.sol";
import { MilestoneEscrow } from "../src/MilestoneEscrow.sol";

/**
 * @notice End-to-end protocol flow: create -> fund -> evidence -> vote -> release.
 * @dev These are the flows the demo walks through, so they double as the
 *      executable spec for the UI.
 */
contract ProtoRwaFlowTest is Fixture {
    function test_CreateProject_SetsDraftState() public {
        uint256 projectId = createProject();

        ProjectRegistry.Project memory project = registry.getProject(projectId);
        assertEq(project.id, projectId);
        assertEq(project.founder, founder);
        assertEq(project.target, TARGET);
        assertEq(project.claimPrice, CLAIM_PRICE);
        assertEq(project.totalClaims, TOTAL_CLAIMS);
        assertEq(uint256(project.status), uint256(ProjectRegistry.ProjectStatus.FUNDING));
        assertEq(registry.milestoneCount(projectId), 2);
    }

    function test_Commit_MintsClaimsAndFundsEscrow() public {
        uint256 projectId = createProject();

        commit(projectId, alice, 6_000);

        assertEq(claimToken.balanceOf(alice, projectId), 6_000);
        assertEq(registry.claimsAvailable(projectId), TOTAL_CLAIMS - 6_000);
        assertEq(escrow.escrowBalance(projectId), 6_000 * CLAIM_PRICE);
    }

    function test_Commit_RejectsUnderpayment() public {
        uint256 projectId = createProject();

        vm.prank(alice);
        vm.expectRevert(ProjectRegistry.ZeroAmount.selector);
        registry.commit{ value: 1 ether }(projectId, 6_000);
    }

    function test_Commit_RejectsOversubscription() public {
        uint256 projectId = createProject();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ProjectRegistry.SoldOut.selector, projectId));
        registry.commit{ value: (TOTAL_CLAIMS + 1) * CLAIM_PRICE }(projectId, TOTAL_CLAIMS + 1);
    }

    function test_Commit_RejectsAfterDeadline() public {
        uint256 projectId = createProject();
        vm.warp(block.timestamp + 15 days);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ProjectRegistry.FundingClosed.selector, projectId));
        registry.commit{ value: 10 * CLAIM_PRICE }(projectId, 10);
    }

    function test_SettleFunding_MovesToProductionWhenTargetMet() public {
        uint256 projectId = createProject();
        fundToTarget(projectId);

        vm.warp(block.timestamp + 15 days);
        registry.settleFunding(projectId);

        ProjectRegistry.Project memory project = registry.getProject(projectId);
        assertEq(uint256(project.status), uint256(ProjectRegistry.ProjectStatus.IN_PRODUCTION));
        assertEq(escrow.escrowBalance(projectId), TARGET);
    }

    function test_SettleFunding_CancelsWhenTargetMissed() public {
        uint256 projectId = createProject();
        commit(projectId, alice, 1_000); // only 10% of target

        vm.warp(block.timestamp + 15 days);
        registry.settleFunding(projectId);

        ProjectRegistry.Project memory project = registry.getProject(projectId);
        assertEq(uint256(project.status), uint256(ProjectRegistry.ProjectStatus.CANCELLED));
    }

    /* ------------------------------------------------------------------ *
     * Milestone review
     * ------------------------------------------------------------------ */

    function test_EvidenceSnapshot_RecordsEligibleWeight() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence-1", bytes32(0), new bytes32[](0));

        MilestoneEscrow.Review memory review = escrow.getReview(projectId, 0);
        assertEq(review.eligibleWeight, TOTAL_CLAIMS);
    }

    function test_Vote_RejectsDoubleVoting() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence-1", bytes32(0), new bytes32[](0));

        vm.prank(alice);
        escrow.vote(projectId, 0, true, false);

        vm.prank(alice);
        vm.expectRevert();
        escrow.vote(projectId, 0, true, false);
    }

    function test_EvidenceSnapshot_IgnoresClaimsAcquiredAfterSubmission() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence-1", bytes32(0), new bytes32[](0));

        // Carol sells to Alice after the snapshot; Alice's weight must not grow.
        vm.prank(carol);
        claimToken.setApprovalForAll(address(market), true);
        vm.prank(carol);
        uint256 listingId = market.list(projectId, 1_000, 0.02 ether, 0);

        vm.prank(alice);
        market.buy{ value: 1_000 * 0.02 ether }(listingId, 1_000);

        MilestoneEscrow.Review memory before = escrow.getReview(projectId, 0);
        assertEq(before.approveWeight, 0);

        vm.prank(alice);
        escrow.vote(projectId, 0, true, false);

        MilestoneEscrow.Review memory afterVote = escrow.getReview(projectId, 0);
        // Weight is the pre-transfer snapshot (6000), not the post-transfer 7000.
        assertEq(afterVote.approveWeight, 6_000);
    }

    function test_SettleReview_ReleasesTrancheOnApproval() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence-1", bytes32(0), new bytes32[](0));

        vm.prank(alice);
        escrow.vote(projectId, 0, true, false);
        vm.prank(bob);
        escrow.vote(projectId, 0, true, false);
        vm.prank(carol);
        escrow.vote(projectId, 0, true, false);

        uint256 founderBefore = founder.balance;

        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        escrow.settleReview(projectId, 0);

        assertEq(founder.balance - founderBefore, 60 ether);
        assertEq(escrow.escrowBalance(projectId), TARGET - 60 ether);
        assertEq(escrow.released(projectId, 0), 60 ether);
    }

    function test_SettleReview_RejectsOnQuorumFailure() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence-1", bytes32(0), new bytes32[](0));

        // Only 1000/10000 = 10% of weight votes; quorum is 25%.
        vm.prank(carol);
        escrow.vote(projectId, 0, true, false);

        uint256 founderBefore = founder.balance;

        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        escrow.settleReview(projectId, 0);

        assertEq(founder.balance, founderBefore);
        assertEq(escrow.escrowBalance(projectId), TARGET);
    }

    function test_SettleReview_RejectsWhenApprovalBelowThreshold() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence-1", bytes32(0), new bytes32[](0));

        // 3000 approve / 6000 reject / 1000 abstain.
        // Quorum (25%) is met by the 10000 cast, but 3000 of 10000 eligible =
        // 30%, which is below the 60% approval threshold, so no release.
        vm.prank(bob);
        escrow.vote(projectId, 0, true, false);
        vm.prank(alice);
        escrow.vote(projectId, 0, false, false);
        vm.prank(carol);
        escrow.vote(projectId, 0, false, true);

        uint256 founderBefore = founder.balance;

        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        escrow.settleReview(projectId, 0);

        assertEq(founder.balance, founderBefore);
        assertEq(escrow.escrowBalance(projectId), TARGET);
    }

    function test_SettleReview_ApprovesExactlyAtThreshold() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence-1", bytes32(0), new bytes32[](0));

        // Exactly 60% approve (alice's 6000 of 10000) meets the threshold.
        vm.prank(alice);
        escrow.vote(projectId, 0, true, false);
        vm.prank(bob);
        escrow.vote(projectId, 0, false, false);
        vm.prank(carol);
        escrow.vote(projectId, 0, false, false);

        uint256 founderBefore = founder.balance;

        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        escrow.settleReview(projectId, 0);

        assertEq(founder.balance - founderBefore, 60 ether);
    }

    function test_SettleReview_RevertsBeforeWindowCloses() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence-1", bytes32(0), new bytes32[](0));

        vm.expectRevert();
        escrow.settleReview(projectId, 0);
    }

    function test_SubmitEvidence_OnlyFounder() public {
        uint256 projectId = fundedProject();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.NotFound.selector, projectId));
        escrow.submitEvidence(projectId, 0, "ipfs://evidence-1", bytes32(0), new bytes32[](0));
    }

    /* ------------------------------------------------------------------ *
     * Refunds
     * ------------------------------------------------------------------ */

    function test_Refund_PaysProRataAfterCancellation() public {
        uint256 projectId = createProject();

        // Under-fund deliberately: 3000 + 1000 units = 40 ether against a
        // 100 ether target, so settleFunding must cancel the project.
        commit(projectId, alice, 3_000);
        commit(projectId, bob, 1_000);

        vm.warp(block.timestamp + 15 days);
        registry.settleFunding(projectId);

        ProjectRegistry.Project memory project = registry.getProject(projectId);
        assertEq(uint256(project.status), uint256(ProjectRegistry.ProjectStatus.CANCELLED));

        uint256 pool = escrow.escrowBalance(projectId);
        uint256 aliceBefore = alice.balance;

        vm.prank(alice);
        escrow.claimRefund(projectId);

        // Alice held 3000 of the 4000 units outstanding, so 75% of the pool.
        assertEq(alice.balance - aliceBefore, (pool * 3_000) / 4_000);
        assertEq(claimToken.balanceOf(alice, projectId), 0);
    }

    function test_Refund_UnavailableWhileInProduction() public {
        uint256 projectId = fundedProject();

        vm.prank(alice);
        vm.expectRevert(MilestoneEscrow.RefundUnavailable.selector);
        escrow.claimRefund(projectId);
    }

    /* ------------------------------------------------------------------ *
     * Secondary market
     * ------------------------------------------------------------------ */

    function test_Market_SettlesTradeAndFee() public {
        uint256 projectId = fundedProject();

        vm.prank(carol);
        claimToken.setApprovalForAll(address(market), true);
        vm.prank(carol);
        uint256 listingId = market.list(projectId, 1_000, 0.02 ether, 0);

        uint256 carolBefore = carol.balance;

        vm.prank(alice);
        market.buy{ value: 1_000 * 0.02 ether }(listingId, 1_000);

        uint256 gross = 1_000 * 0.02 ether;
        uint256 fee = (gross * market.feeBps()) / 10_000;

        assertEq(carol.balance - carolBefore, gross - fee);
        assertEq(market.accruedFees(), fee);
        assertEq(claimToken.balanceOf(alice, projectId), 7_000);
    }

    function test_Market_CancelReturnsClaims() public {
        uint256 projectId = fundedProject();

        vm.prank(carol);
        claimToken.setApprovalForAll(address(market), true);
        vm.prank(carol);
        uint256 listingId = market.list(projectId, 1_000, 0.02 ether, 0);

        assertEq(claimToken.balanceOf(carol, projectId), 0);

        vm.prank(carol);
        market.cancel(listingId);

        assertEq(claimToken.balanceOf(carol, projectId), 1_000);
    }

    function test_Market_OnlySellerCanCancel() public {
        uint256 projectId = fundedProject();

        vm.prank(carol);
        claimToken.setApprovalForAll(address(market), true);
        vm.prank(carol);
        uint256 listingId = market.list(projectId, 1_000, 0.02 ether, 0);

        vm.prank(alice);
        vm.expectRevert();
        market.cancel(listingId);
    }

    function test_Market_RejectsWrongPayment() public {
        uint256 projectId = fundedProject();

        vm.prank(carol);
        claimToken.setApprovalForAll(address(market), true);
        vm.prank(carol);
        uint256 listingId = market.list(projectId, 1_000, 0.02 ether, 0);

        vm.prank(alice);
        vm.expectRevert();
        market.buy{ value: 1 ether }(listingId, 1_000);
    }

    function test_Market_FloorPriceTracksLowestAsk() public {
        uint256 projectId = fundedProject();

        vm.startPrank(carol);
        claimToken.setApprovalForAll(address(market), true);
        market.list(projectId, 500, 0.03 ether, 0);
        market.list(projectId, 500, 0.015 ether, 0);
        vm.stopPrank();

        assertEq(market.floorPrice(projectId), 0.015 ether);
        assertEq(market.askDepth(projectId), 1_000);
    }

    /* ------------------------------------------------------------------ *
     * Frozen transfers
     * ------------------------------------------------------------------ */

    function test_FrozenProject_BlocksTransfers() public {
        uint256 projectId = fundedProject();

        vm.prank(admin);
        claimToken.setFrozen(projectId, true);

        vm.prank(alice);
        vm.expectRevert();
        claimToken.safeTransferFrom(alice, bob, projectId, 100, "");
    }

    /* ------------------------------------------------------------------ *
     * Oracle backstop
     * ------------------------------------------------------------------ */

    function test_Oracle_CanResolveRelease() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence-1", bytes32(0), new bytes32[](0));

        vm.prank(admin);
        escrow.escalate(projectId, 0, "ipfs://rationale");

        uint256 founderBefore = founder.balance;

        vm.prank(admin);
        escrow.oracleResolve(projectId, 0, true, "evidence verified by audit");

        assertEq(founder.balance - founderBefore, 60 ether);
    }

    function test_Oracle_NonAdminCannotResolve() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence-1", bytes32(0), new bytes32[](0));

        vm.prank(alice);
        vm.expectRevert();
        escrow.oracleResolve(projectId, 0, true, "no");
    }

    /* ------------------------------------------------------------------ *
     * Oracle idempotency (regression: oracleResolve used to be re-appliable,
     * paying the tranche out a second time on an already-settled review).
     * ------------------------------------------------------------------ */

    function test_Oracle_CannotDoubleResolve() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence-1", bytes32(0), new bytes32[](0));

        vm.prank(admin);
        escrow.escalate(projectId, 0, "ipfs://rationale");

        uint256 founderBefore = founder.balance;
        vm.prank(admin);
        escrow.oracleResolve(projectId, 0, true, "release tranche 1");
        assertEq(founder.balance - founderBefore, 60 ether, "first resolve should pay one tranche");

        // A second release of the same milestone must be rejected, not silently
        // drained again.
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.ReviewClosed.selector, projectId, 0));
        escrow.oracleResolve(projectId, 0, true, "second release");

        assertEq(founder.balance - founderBefore, 60 ether, "tranche was released twice");
        assertEq(escrow.escrowBalance(projectId), 40 ether, "escrow drained by a replayed resolve");
    }

    function test_Oracle_CannotEscalateAfterSettlement() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence-1", bytes32(0), new bytes32[](0));
        vm.prank(alice);
        escrow.vote(projectId, 0, true, false);
        vm.prank(bob);
        escrow.vote(projectId, 0, true, false);
        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        escrow.settleReview(projectId, 0);

        // The review is already APPROVED; escalating it would reset the outcome to
        // PENDING and re-open it for a second release, so escalate must refuse.
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.ReviewClosed.selector, projectId, 0));
        escrow.escalate(projectId, 0, "ipfs://too-late");
    }

    function test_Oracle_CannotResolveWithoutEvidence() public {
        uint256 projectId = fundedProject();

        // No submitEvidence, so there is no snapshot to resolve against.
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.NoReview.selector, projectId, 0));
        escrow.oracleResolve(projectId, 0, true, "nothing was submitted");
    }
}
