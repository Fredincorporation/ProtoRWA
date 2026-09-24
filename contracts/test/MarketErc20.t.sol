// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ClaimToken } from "../src/ClaimToken.sol";
import { ProjectRegistry } from "../src/ProjectRegistry.sol";
import { MilestoneEscrow } from "../src/MilestoneEscrow.sol";
import { SecondaryMarket } from "../src/SecondaryMarket.sol";
import { IHardwareVerifier } from "../src/IHardwareVerifier.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { MockUsdg } from "./EscrowErc20.t.sol";

/**
 * @title MarketErc20Test
 * @notice Secondary-market settlement on the USDG / ERC-20 payment path.
 *
 * Why this exists as a separate suite:
 *  - The base `Fixture` and the matching suite run the market against native ETH
 *    (`paymentToken == address(0)`). Every real ProtoRWA deployment settles in
 *    USDG, which routes through the *other* branch of `_collect` / `_payout` -
 *    `safeTransferFrom` in, `safeTransfer` out, and `msg.value` must be zero.
 *    That branch is the production config and, before this file, was untested.
 *  - Bid escrow accounting (escrow the buyer's full notional, spend at the maker
 *    price, refund the price-improvement surplus) is subtle and was only ever
 *    exercised with ETH. A regression here strands buyer capital in the market.
 *
 * Every assertion below is denominated in USDG's 6 decimals to prove the money
 * path never assumes ETH's 18.
 */
contract MarketErc20Test is Test {
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
    address internal dave = makeAddr("dave");

    uint256 internal constant CLAIM_PRICE = 10e6; // 10 USDG per claim
    uint256 internal constant TOTAL_CLAIMS = 10_000;
    uint256 internal constant TARGET = TOTAL_CLAIMS * CLAIM_PRICE;
    uint256 internal constant VOTING_PERIOD = 7 days;

    function setUp() public {
        usdg = new MockUsdg();

        claimToken = new ClaimToken(admin, "ipfs://base/{id}.json", "ipfs://contract.json");
        registry = new ProjectRegistry(admin, claimToken, IERC20(address(usdg)));
        escrow = new MilestoneEscrow(
            admin, registry, claimToken, IERC20(address(usdg)), IHardwareVerifier(address(0))
        );
        market =
            new SecondaryMarket(admin, claimToken, registry, escrow, IERC20(address(usdg)), feeRecipient);

        vm.startPrank(admin);
        registry.setEscrow(address(escrow));
        claimToken.grantRole(claimToken.MINTER_ROLE(), address(registry));
        claimToken.grantRole(claimToken.BURNER_ROLE(), address(escrow));
        claimToken.grantRole(claimToken.FREEZER_ROLE(), admin);
        vm.stopPrank();

        usdg.mint(alice, 10_000_000e6);
        usdg.mint(bob, 10_000_000e6);
        usdg.mint(carol, 10_000_000e6);
        usdg.mint(founder, 10_000_000e6);
        usdg.mint(dave, 10_000_000e6);

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

    function commitErc20(uint256 projectId, address investor, uint256 claims) internal {
        uint256 cost = claims * CLAIM_PRICE;
        vm.startPrank(investor);
        usdg.approve(address(registry), cost);
        registry.commit(projectId, claims);
        vm.stopPrank();
        escrow.registerParticipant(projectId, investor);
    }

    /// @notice A funded, in-production project with holders: alice 6k, bob 3k, carol 1k claims.
    function fundedProject() internal returns (uint256 projectId) {
        projectId = createProject();
        commitErc20(projectId, alice, 6_000);
        commitErc20(projectId, bob, 3_000);
        commitErc20(projectId, carol, 1_000);
        vm.warp(block.timestamp + 15 days);
        registry.settleFunding(projectId);
    }

    function approveClaims(address holder) internal {
        vm.prank(holder);
        claimToken.setApprovalForAll(address(market), true);
    }

    /* ------------------------------------------------------------------ *
     * Listing (ERC-20 path just escrows claims; no token moves on list)
     * ------------------------------------------------------------------ */

    function test_List_EscrowsClaims() public {
        uint256 projectId = fundedProject();
        approveClaims(carol);

        vm.prank(carol);
        uint256 listingId = market.list(projectId, 200, 15e6, 0);

        assertEq(claimToken.balanceOf(carol, projectId), 800, "claims not escrowed out of seller");
        assertEq(claimToken.balanceOf(address(market), projectId), 200, "claims not held by market");
        assertEq(market.floorPrice(projectId), 15e6);
        assertEq(market.askDepth(projectId), 200);
        assertEq(listingId, 1);
    }

    /* ------------------------------------------------------------------ *
     * Direct buy: buyer pays gross, seller receives net-of-fee
     * ------------------------------------------------------------------ */

    function test_Buy_PaysGrossAndCreditsSellerNetOfFee() public {
        uint256 projectId = fundedProject();
        approveClaims(carol);
        vm.prank(carol);
        uint256 listingId = market.list(projectId, 200, 15e6, 0);

        uint256 gross = 200 * 15e6; // 3000 USDG
        uint256 fee = (gross * market.feeBps()) / 10_000;

        vm.startPrank(alice);
        usdg.approve(address(market), gross);
        market.buy(listingId, 200);
        vm.stopPrank();

        // Buyer paid exactly gross (the fee came out of the seller's proceeds, not
        // added on top), so the only USDG the market still holds is the accrued fee.
        assertEq(usdg.balanceOf(address(market)), fee, "market should hold only the accrued fee");
        assertEq(market.accruedFees(), fee, "protocol fee not accrued");
        assertEq(claimToken.balanceOf(alice, projectId), 6_000 + 200, "buyer did not receive claims");
        assertEq(claimToken.balanceOf(address(market), projectId), 0, "claims not released to buyer");
    }

    /// @notice Buying must index the new holder so later milestone snapshots include them.
    function test_Buy_IndicesNewHolderForVoting() public {
        uint256 projectId = fundedProject();
        approveClaims(carol);
        vm.prank(carol);
        uint256 listingId = market.list(projectId, 200, 15e6, 0);

        // dave never committed, so he is not yet a participant.
        assertEq(escrow.participantCount(projectId), 3, "expected alice/bob/carol before the trade");

        uint256 gross = 200 * 15e6;
        vm.startPrank(dave);
        usdg.approve(address(market), gross);
        market.buy(listingId, 200);
        vm.stopPrank();

        assertEq(escrow.participantCount(projectId), 4, "buyer was not indexed as a participant");
        assertEq(claimToken.balanceOf(dave, projectId), 200);
    }

    function test_Buy_SellerReceivesNetOfFee() public {
        uint256 projectId = fundedProject();
        approveClaims(carol);
        vm.prank(carol);
        uint256 listingId = market.list(projectId, 200, 15e6, 0);

        uint256 gross = 200 * 15e6;
        uint256 fee = (gross * market.feeBps()) / 10_000;

        uint256 before = usdg.balanceOf(carol);
        vm.startPrank(alice);
        usdg.approve(address(market), gross);
        market.buy(listingId, 200);
        vm.stopPrank();

        assertEq(usdg.balanceOf(carol) - before, gross - fee, "seller must receive gross minus fee");
    }

    function test_Buy_RejectsNativeValueOnTokenPath() public {
        uint256 projectId = fundedProject();
        approveClaims(carol);
        vm.prank(carol);
        uint256 listingId = market.list(projectId, 200, 15e6, 0);

        vm.deal(alice, 1 ether);
        vm.startPrank(alice);
        usdg.approve(address(market), 200 * 15e6);
        vm.expectRevert(SecondaryMarket.WrongPayment.selector);
        market.buy{ value: 1 wei }(listingId, 200);
        vm.stopPrank();
    }

    function test_Buy_RejectsPartialThenInsufficient() public {
        uint256 projectId = fundedProject();
        approveClaims(carol);
        vm.prank(carol);
        uint256 listingId = market.list(projectId, 200, 15e6, 0);

        // Buy 150 of 200: 50 remain.
        vm.startPrank(alice);
        usdg.approve(address(market), 200 * 15e6);
        market.buy(listingId, 150);
        vm.stopPrank();
        assertEq(market.askDepth(projectId), 50, "partial fill depth wrong");

        // Buying more than remains must revert rather than over-selling.
        vm.startPrank(bob);
        usdg.approve(address(market), 100 * 15e6);
        vm.expectRevert(SecondaryMarket.InsufficientClaims.selector);
        market.buy(listingId, 100);
        vm.stopPrank();
    }

    /* ------------------------------------------------------------------ *
     * Cancel paths
     * ------------------------------------------------------------------ */

    function test_Cancel_ReturnsEscrowedClaims() public {
        uint256 projectId = fundedProject();
        approveClaims(carol);
        vm.prank(carol);
        uint256 listingId = market.list(projectId, 200, 15e6, 0);

        vm.prank(carol);
        market.cancel(listingId);

        assertEq(claimToken.balanceOf(carol, projectId), 1_000, "claims not returned to seller");
        assertEq(market.askDepth(projectId), 0);
    }

    function test_Cancel_OnlySeller() public {
        uint256 projectId = fundedProject();
        approveClaims(carol);
        vm.prank(carol);
        uint256 listingId = market.list(projectId, 200, 15e6, 0);

        vm.prank(alice);
        vm.expectRevert(SecondaryMarket.NotSeller.selector);
        market.cancel(listingId);
    }

    /* ------------------------------------------------------------------ *
     * Bids: escrow full notional, spend at the maker (ask) price, refund surplus
     * ------------------------------------------------------------------ */

    function test_Bid_SurplusRefundedOnPriceImprovement() public {
        uint256 projectId = fundedProject();
        approveClaims(carol);
        vm.prank(carol);
        market.list(projectId, 100, 12e6, 0); // resting ask cheaper than the bid

        uint256 escrowed = 100 * 15e6; // buyer commits at 15 USDG
        uint256 actual = 100 * 12e6; // fills at the maker (ask) 12 USDG
        uint256 fee = (actual * market.feeBps()) / 10_000;

        uint256 aliceBefore = usdg.balanceOf(alice);
        uint256 carolBefore = usdg.balanceOf(carol);

        vm.startPrank(alice);
        usdg.approve(address(market), escrowed);
        market.placeBid(projectId, 100, 15e6, 0);
        vm.stopPrank();

        // Buyer only spends the ask price; the 3 USDG/claim surplus is refunded.
        assertEq(aliceBefore - usdg.balanceOf(alice), actual, "buyer charged more than the ask price");
        assertEq(usdg.balanceOf(address(market)), fee, "market should hold only the accrued fee");
        assertEq(usdg.balanceOf(carol) - carolBefore, actual - fee, "seller proceeds wrong");
        assertEq(claimToken.balanceOf(alice, projectId), 6_000 + 100);
        assertEq(market.bidDepth(projectId), 0, "filled bid must not remain");
    }

    function test_Bid_RestsWhenNoCrossingAsk() public {
        uint256 projectId = fundedProject();

        uint256 before = usdg.balanceOf(alice);
        vm.startPrank(alice);
        usdg.approve(address(market), 100 * 11e6);
        uint256 bidId = market.placeBid(projectId, 100, 11e6, 0);
        vm.stopPrank();

        assertEq(usdg.balanceOf(alice), before - 100 * 11e6, "unmatched bid must still escrow");
        assertEq(market.bidDepth(projectId), 100);
        assertEq(market.bestBid(projectId), 11e6);
        assertEq(market.bidEscrow(bidId), 100 * 11e6);
    }

    function test_RestingBid_FilledByLaterAsk() public {
        uint256 projectId = fundedProject();

        vm.startPrank(alice);
        usdg.approve(address(market), 100 * 14e6);
        market.placeBid(projectId, 100, 14e6, 0);
        vm.stopPrank();

        approveClaims(carol);
        uint256 carolBefore = usdg.balanceOf(carol);
        uint256 fee = 14e6; // 1% of 100 * 14e6

        vm.prank(carol);
        market.list(projectId, 100, 13e6, 0); // maker-taker: executes at the resting bid's 14

        // Ask is the taker, so the fill happens at the bid's 14 USDG.
        assertEq(usdg.balanceOf(carol) - carolBefore, 100 * 14e6 - fee, "seller did not get maker price");
        assertEq(claimToken.balanceOf(alice, projectId), 6_000 + 100);
        assertEq(market.askDepth(projectId), 0);
        assertEq(market.bidDepth(projectId), 0);
    }

    function test_CancelBid_RefundsEscrowedUsdg() public {
        uint256 projectId = fundedProject();

        uint256 before = usdg.balanceOf(alice);
        vm.startPrank(alice);
        usdg.approve(address(market), 100 * 11e6);
        uint256 bidId = market.placeBid(projectId, 100, 11e6, 0);
        vm.stopPrank();

        vm.prank(alice);
        market.cancelBid(bidId);

        assertEq(usdg.balanceOf(alice), before, "cancel did not refund the full escrow");
        assertEq(market.bidDepth(projectId), 0);
    }

    function test_CancelBid_OnlyBuyer() public {
        uint256 projectId = fundedProject();

        vm.startPrank(alice);
        usdg.approve(address(market), 100 * 11e6);
        uint256 bidId = market.placeBid(projectId, 100, 11e6, 0);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(SecondaryMarket.NotBuyer.selector);
        market.cancelBid(bidId);
    }

    /* ------------------------------------------------------------------ *
     * Cross-project isolation: a bid must never fill an ask from another
     * project, or it would move claims across ERC-1155 ids by accident.
     * ------------------------------------------------------------------ */

    function test_Matching_NeverCrossesProjects() public {
        uint256 p1 = fundedProject();
        uint256 p2 = createProject(); // different project, FUNDING status

        approveClaims(carol);
        vm.prank(carol);
        market.list(p1, 100, 12e6, 0); // a fillable ask... but on p1

        vm.startPrank(alice);
        usdg.approve(address(market), 100 * 20e6);
        uint256 bidId = market.placeBid(p2, 100, 20e6, 0); // aggressive bid on p2
        vm.stopPrank();

        assertEq(market.bidEscrow(bidId), 100 * 20e6, "cross-project bid wrongly matched");
        assertEq(market.askDepth(p1), 100, "ask on p1 wrongly consumed by a p2 bid");
        assertEq(claimToken.balanceOf(alice, p1), 6_000, "buyer wrongly received p1 claims");
    }

    /* ------------------------------------------------------------------ *
     * Fee configuration and withdrawal on the token path
     * ------------------------------------------------------------------ */

    function test_SetFeeBps_OnlyAdminAndBounded() public {
        vm.prank(alice);
        vm.expectRevert();
        market.setFeeBps(200);

        vm.prank(admin);
        market.setFeeBps(200);
        assertEq(market.feeBps(), 200);

        vm.prank(admin);
        vm.expectRevert(SecondaryMarket.FeeTooHigh.selector);
        market.setFeeBps(1_001);
    }

    function test_WithdrawFees_PaysRecipientInUsdg() public {
        uint256 projectId = fundedProject();
        approveClaims(carol);
        vm.prank(carol);
        uint256 listingId = market.list(projectId, 200, 15e6, 0);

        uint256 gross = 200 * 15e6;
        uint256 fee = (gross * market.feeBps()) / 10_000;

        vm.startPrank(alice);
        usdg.approve(address(market), gross);
        market.buy(listingId, 200);
        vm.stopPrank();

        uint256 recipientBefore = usdg.balanceOf(feeRecipient);

        vm.prank(alice);
        vm.expectRevert();
        market.withdrawFees();

        vm.prank(admin);
        market.withdrawFees();

        assertEq(usdg.balanceOf(feeRecipient) - recipientBefore, fee, "fee not paid in USDG");
        assertEq(market.accruedFees(), 0, "accrued fees not reset");
    }

    function test_FeeSnapshotsPerListing() public {
        uint256 projectId = fundedProject();
        approveClaims(carol);
        vm.prank(carol);
        uint256 listingId = market.list(projectId, 200, 15e6, 0); // feeBps 100 at list time

        // Raising the global fee must not retroactively change the open order.
        vm.prank(admin);
        market.setFeeBps(500);

        uint256 gross = 200 * 15e6;
        vm.startPrank(alice);
        usdg.approve(address(market), gross);
        market.buy(listingId, 200);
        vm.stopPrank();

        assertEq(market.accruedFees(), (gross * 100) / 10_000, "open listing charged the new fee");
    }
}
