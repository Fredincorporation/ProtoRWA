// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Fixture } from "./Fixture.sol";
import { SecondaryMarket } from "../src/SecondaryMarket.sol";

/**
 * @notice Two-sided order book: resting bids, escrowed notional, and price-time
 *         crossing in both directions (taker bid vs resting asks, taker ask vs
 *         resting bids).
 * @dev Fixture settles in native ETH (paymentToken == address(0)), so bid
 *      notional is escrowed via `msg.value` and refunded on full fill / cancel.
 *      Default protocol fee is 100 bps (1%).
 */
contract MarketMatchingTest is Fixture {
    uint256 internal constant FEE_BPS = 100;

    function _aliceBid(uint256 projectId, uint256 amount, uint256 price, uint64 expires)
        internal
        returns (uint256)
    {
        vm.prank(alice);
        return market.placeBid{ value: amount * price }(projectId, amount, price, expires);
    }

    function _list(address seller, uint256 projectId, uint256 amount, uint256 price)
        internal
        returns (uint256)
    {
        vm.startPrank(seller);
        claimToken.setApprovalForAll(address(market), true);
        uint256 id = market.list(projectId, amount, price, 0);
        vm.stopPrank();
        return id;
    }

    function test_PlaceBid_EscrowsAndRests() public {
        uint256 projectId = fundedProject();

        uint256 bidId = _aliceBid(projectId, 1_000, 0.02 ether, 0);
        assertGt(bidId, 0);
        // 1000 * 0.02 = 20 ether pulled from alice into the contract.
        assertEq(market.bidEscrow(bidId), 20 ether);
        assertEq(address(market).balance, 20 ether);
        assertEq(market.bidDepth(projectId), 1_000);
        assertEq(market.bestBid(projectId), 0.02 ether);
        assertEq(claimToken.balanceOf(alice, projectId), 6_000); // unchanged, no ask to hit
    }

    function test_CancelBid_RefundsEscrow() public {
        uint256 projectId = fundedProject();
        uint256 aliceStart = alice.balance;
        uint256 bidId = _aliceBid(projectId, 1_000, 0.02 ether, 0);
        assertEq(alice.balance, aliceStart - 20 ether);

        vm.prank(alice);
        market.cancelBid(bidId);

        assertEq(alice.balance, aliceStart);
        assertEq(market.bidEscrow(bidId), 0);
        assertEq(market.bidDepth(projectId), 0);
    }

    function test_OnlyBidderCanCancel() public {
        uint256 projectId = fundedProject();
        uint256 bidId = _aliceBid(projectId, 1_000, 0.02 ether, 0);

        vm.prank(bob);
        vm.expectRevert(SecondaryMarket.NotBuyer.selector);
        market.cancelBid(bidId);
    }

    function test_TakerBid_CrossesRestingAskAtAskPrice() public {
        uint256 projectId = fundedProject();
        // carol rests an ask of 1000 @ 0.015 (the maker).
        _list(carol, projectId, 1_000, 0.015 ether);

        uint256 carolBefore = carol.balance;
        uint256 aliceBefore = alice.balance;

        // alice bids 1000 @ 0.02 -> executes at the ask's 0.015, surplus refunded.
        uint256 bidId = _aliceBid(projectId, 1_000, 0.02 ether, 0);

        uint256 gross = 1_000 * 0.015 ether; // 15 ether
        uint256 fee = (gross * FEE_BPS) / 10_000;

        assertEq(claimToken.balanceOf(alice, projectId), 7_000);
        assertEq(carol.balance - carolBefore, gross - fee);
        assertEq(market.accruedFees(), fee);
        // alice escrowed 20, paid 15, got 5 back.
        assertEq(alice.balance, aliceBefore - gross);
        assertEq(market.bidEscrow(bidId), 0);
        assertEq(market.bidDepth(projectId), 0);
        assertEq(market.askDepth(projectId), 0);
    }

    function test_TakerAsk_CrossesRestingBidAtBidPrice() public {
        uint256 projectId = fundedProject();
        // alice rests a bid 1000 @ 0.02 (the maker).
        _aliceBid(projectId, 1_000, 0.02 ether, 0);

        uint256 aliceAfterBid = alice.balance;
        uint256 carolBefore = carol.balance;

        // carol lists ask 1000 @ 0.015 -> crosses the resting bid at 0.02.
        _list(carol, projectId, 1_000, 0.015 ether);

        uint256 gross = 1_000 * 0.02 ether; // executed at maker bid price
        uint256 fee = (gross * FEE_BPS) / 10_000;

        assertEq(claimToken.balanceOf(alice, projectId), 7_000);
        assertEq(carol.balance - carolBefore, gross - fee);
        assertEq(market.accruedFees(), fee);
        // alice's 20 ether escrow fully consumed; balance unchanged from post-bid.
        assertEq(alice.balance, aliceAfterBid);
        assertEq(market.bidDepth(projectId), 0);
        assertEq(market.askDepth(projectId), 0);
    }

    function test_PartialFill_LeavesBidResting() public {
        uint256 projectId = fundedProject();
        _list(carol, projectId, 500, 0.01 ether);

        uint256 bidId = _aliceBid(projectId, 1_000, 0.02 ether, 0);

        // 500 filled at 0.01; 500 rests at 0.02.
        assertEq(claimToken.balanceOf(alice, projectId), 6_500);
        assertEq(market.bidDepth(projectId), 500);
        assertEq(market.askDepth(projectId), 0);
        // escrow: paid 500*0.01 = 5, of the 20 escrowed, 15 left for the resting half.
        assertEq(market.bidEscrow(bidId), 15 ether);
    }

    function test_PriceTimePriority_CheapestAskFillsFirst() public {
        uint256 projectId = fundedProject();
        uint256 bobStart = bob.balance;
        uint256 carolStart = carol.balance;

        _list(bob, projectId, 500, 0.03 ether); // worse ask
        _list(carol, projectId, 500, 0.02 ether); // best ask

        _aliceBid(projectId, 500, 0.03 ether, 0); // taker bid up to 0.03

        uint256 gross = 500 * 0.02 ether; // must hit carol's cheaper ask
        uint256 fee = (gross * FEE_BPS) / 10_000;

        // carol (cheapest) is paid; bob's higher ask is untouched.
        assertEq(carol.balance, carolStart + gross - fee);
        assertEq(bob.balance, bobStart);
        assertEq(claimToken.balanceOf(alice, projectId), 6_500);
        assertEq(market.askDepth(projectId), 500); // bob's 0.03 ask remains
    }

    function test_BidBelowBestAsk_DoesNotMatch() public {
        uint256 projectId = fundedProject();
        _list(carol, projectId, 1_000, 0.03 ether);
        _aliceBid(projectId, 1_000, 0.02 ether, 0);

        assertEq(market.askDepth(projectId), 1_000);
        assertEq(market.bidDepth(projectId), 1_000);
        assertEq(claimToken.balanceOf(alice, projectId), 6_000);
    }

    function test_PlaceBid_RejectsZeroAmount() public {
        uint256 projectId = fundedProject();
        vm.prank(alice);
        vm.expectRevert(SecondaryMarket.ZeroAmount.selector);
        market.placeBid{ value: 1 ether }(projectId, 0, 0.02 ether, 0);
    }

    function test_PlaceBid_RejectsExpired() public {
        uint256 projectId = fundedProject();
        uint64 past = uint64(block.timestamp - 1);
        vm.prank(alice);
        vm.expectRevert(SecondaryMarket.ExpiredListing.selector);
        market.placeBid{ value: 2 ether }(projectId, 100, 0.02 ether, past);
    }

    function test_ExpiredBid_NotMatchedByLaterAsk() public {
        uint256 projectId = fundedProject();
        uint64 soon = uint64(block.timestamp + 10);
        _aliceBid(projectId, 1_000, 0.02 ether, soon);

        vm.warp(block.timestamp + 11); // bid now expired

        _list(carol, projectId, 1_000, 0.015 ether);

        // Expired bid must not be treated as resting liquidity by the ask.
        assertEq(market.askDepth(projectId), 1_000);
        assertEq(market.bestBid(projectId), 0);
        assertEq(claimToken.balanceOf(alice, projectId), 6_000);
    }
}
