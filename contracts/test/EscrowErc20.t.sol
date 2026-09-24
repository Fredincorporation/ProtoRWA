// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ClaimToken } from "../src/ClaimToken.sol";
import { ProjectRegistry } from "../src/ProjectRegistry.sol";
import { MilestoneEscrow } from "../src/MilestoneEscrow.sol";
import { SecondaryMarket } from "../src/SecondaryMarket.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @notice A 6-decimal ERC-20, mirroring USDG (Paxos Global Dollar) exactly.
 *
 * The decimals matter and are the reason this is not the generic 18-decimal mock.
 * USDG is deployed with 6 decimals while ETH has 18, so any assumption of
 * `10 ** 18` in the payment path is wrong by a factor of 10^12 - a discrepancy
 * that a suite using an 18-decimal mock would never expose.
 */
contract MockUsdg is ERC20 {
    constructor() ERC20("Global Dollar", "USDG") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @notice ERC-20 settlement path, added because escrow was ETH-only in practice.
 *
 * The defect this suite exists to catch: `ProjectRegistry.commit()` transferred
 * the payment token to the escrow with `safeTransfer` but never called
 * `MilestoneEscrow.deposit()`, so `escrowBalance[projectId]` remained zero while
 * the tokens sat in the escrow contract. The result was stranded capital -
 * `settleReview()` reverted with `InsufficientEscrow` on any approved milestole
 * and `claimRefund()` paid zero against an empty pool. Native ETH was unaffected
 * because it took the `deposit{value:}` path.
 *
 * Every test here would have failed before the fix, and the ETH suite could not
 * have detected it.
 */
contract EscrowErc20Test is Test {
    MockUsdg internal usdg;
    ClaimToken internal claimToken;
    ProjectRegistry internal registry;
    MilestoneEscrow internal escrow;
    SecondaryMarket internal market;

    address internal admin = makeAddr("admin");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal founder = makeAddr("founder");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    /// @dev 1 USDG == 1e6 base units. Priced at 10 USDG per claim.
    uint256 internal constant CLAIM_PRICE = 10e6;
    uint256 internal constant TOTAL_CLAIMS = 10_000;
    uint256 internal constant TARGET = TOTAL_CLAIMS * CLAIM_PRICE;
    uint256 internal constant VOTING_PERIOD = 7 days;

    function setUp() public {
        usdg = new MockUsdg();

        claimToken = new ClaimToken(admin, "ipfs://base/{id}.json", "ipfs://contract.json");
        registry = new ProjectRegistry(admin, claimToken, IERC20(address(usdg)));
        escrow = new MilestoneEscrow(admin, registry, claimToken, IERC20(address(usdg)));
        market = new SecondaryMarket(
            admin,
            claimToken,
            registry,
            escrow,
            IERC20(address(usdg)),
            feeRecipient
        );

        vm.startPrank(admin);
        registry.setEscrow(address(escrow));
        claimToken.grantRole(claimToken.MINTER_ROLE(), address(registry));
        claimToken.grantRole(claimToken.BURNER_ROLE(), address(escrow));
        claimToken.grantRole(claimToken.FREEZER_ROLE(), admin);
        vm.stopPrank();

        // Fund every participant generously; the amounts are irrelevant next to
        // the accounting bug, which failed regardless of balance.
        usdg.mint(alice, 1_000_000e6);
        usdg.mint(bob, 1_000_000e6);
        usdg.mint(carol, 1_000_000e6);
        usdg.mint(founder, 1_000_000e6);

        vm.warp(1_700_000_000);
    }

    /* ------------------------------------------------------------------ *
     * Helpers
     * ------------------------------------------------------------------ */

    function createProject() internal returns (uint256 projectId) {
        ProjectRegistry.CreateProjectParams memory params = ProjectRegistry.CreateProjectParams({
            title: "HelioFrost Pro",
            tagline: "Solar cold-chain unit",
            metadataCid: "ipfs://meta",
            coverCid: "ipfs://cover",
            target: TARGET,
            claimPrice: CLAIM_PRICE,
            totalClaims: TOTAL_CLAIMS,
            fundingDeadline: uint64(block.timestamp + 14 days)
        });

        vm.prank(founder);
        projectId = registry.createProject(params);

        ProjectRegistry.Milestone[] memory milestones = new ProjectRegistry.Milestone[](2);
        milestones[0] = ProjectRegistry.Milestone({
            title: "Tooling & first article",
            description: "Tooling paid, first article inspected",
            trancheAmount: TARGET * 60 / 100,
            dueAt: uint64(block.timestamp + 30 days),
            votingPeriodSeconds: uint32(VOTING_PERIOD),
            approvalThresholdBps: 6_000,
            quorumBps: 2_500,
            status: ProjectRegistry.MilestoneStatus.PENDING
        });
        milestones[1] = ProjectRegistry.Milestone({
            title: "Production & shipping",
            description: "Batch produced and shipped",
            trancheAmount: TARGET * 40 / 100,
            dueAt: uint64(block.timestamp + 60 days),
            votingPeriodSeconds: uint32(VOTING_PERIOD),
            approvalThresholdBps: 6_000,
            quorumBps: 2_500,
            status: ProjectRegistry.MilestoneStatus.PENDING
        });

        vm.prank(founder);
        registry.setMilestones(projectId, milestones);

        vm.prank(founder);
        registry.openFunding(projectId);
    }

    /// @notice Commits USDG as `investor`, approving the registry first.
    function commitErc20(uint256 projectId, address investor, uint256 claims) internal {
        uint256 cost = claims * CLAIM_PRICE;

        vm.startPrank(investor);
        usdg.approve(address(registry), cost);
        registry.commit(projectId, claims);
        vm.stopPrank();

        escrow.registerParticipant(projectId, investor);
    }

    function fundToTarget(uint256 projectId) internal {
        commitErc20(projectId, alice, 6_000);
        commitErc20(projectId, bob, 3_000);
        commitErc20(projectId, carol, 1_000);
    }

    function settleToProduction(uint256 projectId) internal {
        vm.warp(block.timestamp + 15 days);
        registry.settleFunding(projectId);
    }

    function fundedProject() internal returns (uint256 projectId) {
        projectId = createProject();
        fundToTarget(projectId);
        settleToProduction(projectId);
    }

    /* ------------------------------------------------------------------ *
     * The regression this suite was written for
     * ------------------------------------------------------------------ */

    /// @notice A USDG commitment must be credited to the escrow, not just moved.
    function test_CommitCreditsEscrowBalanceForErc20() public {
        uint256 projectId = createProject();
        uint256 cost = 1_000 * CLAIM_PRICE;

        commitErc20(projectId, alice, 1_000);

        // The escrow must believe it holds the capital...
        assertEq(
            escrow.escrowBalance(projectId),
            cost,
            "escrow did not credit the ERC-20 commitment - funds would be stranded"
        );

        // ...and it must actually hold it.
        assertEq(usdg.balanceOf(address(escrow)), cost, "tokens did not reach escrow");
    }

    /// @notice The bug's user-visible consequence: an approved tranche could not pay out.
    function test_ApprovedTrancheTransfersUsdgToFounder() public {
        uint256 projectId = fundedProject();

        uint256 balanceBefore = usdg.balanceOf(founder);

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence");

        vm.prank(alice);
        escrow.vote(projectId, 0, true, false);
        vm.prank(bob);
        escrow.vote(projectId, 0, true, false);

        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        escrow.settleReview(projectId, 0);

        ProjectRegistry.Milestone memory milestone = registry.getMilestone(projectId, 0);
        uint256 delta = usdg.balanceOf(founder) - balanceBefore;

        assertEq(delta, milestone.trancheAmount, "founder did not receive the tranche");

        /*
         * The schedule is a 60/40 split, so releasing milestone 0 must leave the
         * second tranche untouched. Asserting zero here would have been wrong -
         * and asserting the exact remainder proves the draw-down is proportional
         * to the tranche rather than draining the whole project.
         */
        assertEq(
            escrow.escrowBalance(projectId),
            TARGET - milestone.trancheAmount,
            "escrow should retain the second tranche after releasing the first"
        );
    }

    /// @notice Refunds must return real USDG rather than paying out of an empty pool.
    function test_CancelledProjectRefundsUsdg() public {
        uint256 projectId = createProject();

        /*
         * Deliberately UNDER-funded. Reaching the target settles the project into
         * IN_PRODUCTION instead of CANCELLED, which is why the amounts here are a
         * partial raise rather than the full TARGET the other tests use.
         *
         * There is also no explicit cancel entrypoint: a project becomes
         * CANCELLED by missing its target when the deadline passes, so the test
         * drives that real path rather than a kill switch that does not exist.
         */
        commitErc20(projectId, alice, 600);
        commitErc20(projectId, bob, 300);

        vm.warp(block.timestamp + 15 days);
        registry.settleFunding(projectId);

        assertEq(
            uint256(registry.getProject(projectId).status),
            uint256(ProjectRegistry.ProjectStatus.CANCELLED),
            "project should be CANCELLED after a partial raise hits the deadline"
        );

        uint256 aliceBefore = usdg.balanceOf(alice);

        vm.prank(alice);
        escrow.claimRefund(projectId);

        uint256 refunded = usdg.balanceOf(alice) - aliceBefore;
        assertGt(refunded, 0, "refund paid nothing against an empty escrow pool");
        assertEq(
            refunded,
            600 * CLAIM_PRICE,
            "refund should return the full commitment for a cancelled project"
        );
    }

    /* ------------------------------------------------------------------ *
     * Accounting integrity
     * ------------------------------------------------------------------ */

    /// @notice Only the registry may credit an ERC-20 commitment.
    function test_DepositTokenRejectsUnprivilegedCaller() public {
        uint256 projectId = createProject();

        vm.prank(alice);
        vm.expectRevert(MilestoneEscrow.TransferFailed.selector);
        escrow.depositToken(projectId, 1_000e6);
    }

    /// @notice The escrow must not credit more than it actually received.
    function test_DepositTokenRejectsAmountExceedingRealBalance() public {
        uint256 projectId = createProject();

        /*
         * The registry is trusted, so a call through it is the realistic path for
         * a mis-reported amount. Sending nothing and claiming a balance must be
         * rejected - otherwise escrowBalance would become a claim about the funds
         * rather than a fact about them.
         */
        vm.prank(address(registry));
        vm.expectRevert(MilestoneEscrow.InsufficientEscrow.selector);
        escrow.depositToken(projectId, 1_000e6);
    }

    /// @notice Accounted total falls when a tranche is released, so the next deposit still validates.
    function test_TotalAccountedStaysInStepWithBalance() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence");
        vm.prank(alice);
        escrow.vote(projectId, 0, true, false);
        vm.prank(bob);
        escrow.vote(projectId, 0, true, false);
        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        escrow.settleReview(projectId, 0);

        // Whatever remains, the two must agree exactly - a mismatch means the
        // next legitimate commitment would be wrongly rejected.
        assertEq(
            escrow.totalAccounted(),
            usdg.balanceOf(address(escrow)),
            "accounted total drifted from the real token balance"
        );
    }

    /// @notice A later commitment must still be accepted after an earlier release.
    function test_SecondCommitmentAcceptedAfterRelease() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence");
        vm.prank(alice);
        escrow.vote(projectId, 0, true, false);
        vm.prank(bob);
        escrow.vote(projectId, 0, true, false);
        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        escrow.settleReview(projectId, 0);

        // A post-release commitment into a second project on the same escrow.
        uint256 second = createProject();
        commitErc20(second, carol, 500);

        assertEq(
            escrow.escrowBalance(second),
            500 * CLAIM_PRICE,
            "commitment after a release was rejected - accounted total is stale"
        );
    }

    /* ------------------------------------------------------------------ *
     * Decimal correctness
     * ------------------------------------------------------------------ */

    /// @notice Amounts are handled in USDG's 6 decimals, not ETH's 18.
    function test_AmountsUseSixDecimals() public {
        uint256 projectId = createProject();

        assertEq(usdg.decimals(), 6, "mock must mirror USDG's 6 decimals");

        commitErc20(projectId, alice, 1);

        // 1 claim at 10 USDG is 10e6 base units. An 18-decimal assumption would
        // have produced 10e18 - a factor of 10^12 too large.
        assertEq(escrow.escrowBalance(projectId), 10e6);
        assertEq(usdg.balanceOf(address(escrow)), 10e6);
    }

    /// @notice No ETH is accepted when the payment token is an ERC-20.
    function test_NativeValueRejectedOnErc20Project() public {
        uint256 projectId = createProject();
        uint256 cost = 1_000 * CLAIM_PRICE;

        vm.deal(alice, 1 ether);
        vm.startPrank(alice);
        usdg.approve(address(registry), cost);
        vm.expectRevert(ProjectRegistry.ZeroAmount.selector);
        registry.commit{ value: 1 wei }(projectId, 1_000);
        vm.stopPrank();
    }

    /// @notice The oracle cannot release the same USDG tranche twice (production path).
    function test_Oracle_CannotDoubleReleaseUsdg() public {
        uint256 projectId = fundedProject();

        vm.prank(founder);
        escrow.submitEvidence(projectId, 0, "ipfs://evidence");

        vm.prank(admin);
        escrow.escalate(projectId, 0, "ipfs://rationale");

        uint256 before = usdg.balanceOf(founder);
        vm.prank(admin);
        escrow.oracleResolve(projectId, 0, true, "release");
        assertEq(usdg.balanceOf(founder) - before, TARGET * 60 / 100, "first release wrong");

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.ReviewClosed.selector, projectId, 0));
        escrow.oracleResolve(projectId, 0, true, "second release");

        assertEq(usdg.balanceOf(founder) - before, TARGET * 60 / 100, "USDG tranche released twice");
        assertEq(usdg.balanceOf(address(escrow)), TARGET - (TARGET * 60 / 100), "escrow over-drained");
    }
}
