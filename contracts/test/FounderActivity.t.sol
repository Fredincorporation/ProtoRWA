// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Fixture } from "./Fixture.sol";
import { FounderActivity, IProjectRegistry } from "../src/FounderActivity.sol";
import { ProjectRegistry } from "../src/ProjectRegistry.sol";

/**
 * @notice Covers the social trust model: founder self-proof via registry
 *         ownership, the follow graph (only registered founders are followable),
 *         and update authorship + indexing.
 */
contract FounderActivityTest is Fixture {
    FounderActivity internal activity;

    function setUp() public override {
        super.setUp();
        activity = new FounderActivity(IProjectRegistry(address(registry)));
    }

    /* ---------------------------------------------------------------- *
     * registerFounder
     * ---------------------------------------------------------------- */

    function test_RegisterFounderWithOwnProject() public {
        uint256 pid = createProject();
        vm.prank(founder);
        activity.registerFounder(pid);
        assertTrue(activity.isFounder(founder));
    }

    function test_NonFounderCannotRegister() public {
        uint256 pid = createProject();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(FounderActivity.NotProjectFounder.selector, pid, alice)
        );
        activity.registerFounder(pid);
    }

    /* ---------------------------------------------------------------- *
     * postUpdate
     * ---------------------------------------------------------------- */

    function test_PostUpdateProvesFounderAndStores() public {
        uint256 pid = createProject();
        vm.prank(founder);
        uint256 id = activity.postUpdate(pid, "ipfs://update-1");

        FounderActivity.Update[] memory ups = activity.getProjectUpdates(pid);
        assertEq(ups.length, 1);
        assertEq(ups[0].id, id);
        assertEq(ups[0].projectId, pid);
        assertEq(ups[0].author, founder);
        assertEq(ups[0].cid, "ipfs://update-1");
        assertEq(ups[0].ts, uint64(block.timestamp));
        assertTrue(activity.isFounder(founder));
        assertEq(activity.getFounderUpdates(founder).length, 1);
    }

    function test_PostUpdateByNonFounderReverts() public {
        uint256 pid = createProject();
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(FounderActivity.NotProjectFounder.selector, pid, bob)
        );
        activity.postUpdate(pid, "ipfs://x");
    }

    function test_PostUpdateEmptyCidReverts() public {
        uint256 pid = createProject();
        vm.prank(founder);
        vm.expectRevert(FounderActivity.EmptyCid.selector);
        activity.postUpdate(pid, "");
    }

    function test_UpdateIdMonotonicAcrossProjects() public {
        uint256 pid1 = createProject();
        vm.prank(founder);
        uint256 id1 = activity.postUpdate(pid1, "ipfs://a");

        ProjectRegistry.CreateProjectParams memory params = ProjectRegistry.CreateProjectParams({
            title: "Second",
            tagline: "t",
            metadataCid: "m",
            coverCid: "c",
            target: TARGET,
            claimPrice: CLAIM_PRICE,
            totalClaims: TOTAL_CLAIMS,
            fundingDeadline: uint64(block.timestamp + 14 days)
        });
        vm.prank(founder);
        uint256 pid2 = registry.createProject(params);
        vm.prank(founder);
        uint256 id2 = activity.postUpdate(pid2, "ipfs://b");

        assertGt(id2, id1);
        assertEq(activity.getProjectUpdates(pid2).length, 1);
        assertEq(activity.getFounderUpdates(founder).length, 2);
    }

    /* ---------------------------------------------------------------- *
     * follow graph
     * ---------------------------------------------------------------- */

    function test_FollowRequiresRegisteredFounder() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FounderActivity.NotAFollowableFounder.selector, alice));
        activity.follow(alice);
    }

    function test_FollowAndUnfollow() public {
        uint256 pid = createProject();
        vm.prank(founder);
        activity.registerFounder(pid);

        vm.prank(alice);
        activity.follow(founder);
        assertTrue(activity.isFollowing(alice, founder));
        assertEq(activity.followerCount(founder), 1);

        vm.prank(bob);
        activity.follow(founder);
        assertEq(activity.followerCount(founder), 2);

        vm.prank(alice);
        activity.unfollow(founder);
        assertFalse(activity.isFollowing(alice, founder));
        assertEq(activity.followerCount(founder), 1);
    }

    function test_CannotFollowSelf() public {
        uint256 pid = createProject();
        vm.prank(founder);
        activity.registerFounder(pid);
        vm.prank(founder);
        vm.expectRevert(FounderActivity.SelfFollow.selector);
        activity.follow(founder);
    }

    function test_CannotDoubleFollow() public {
        uint256 pid = createProject();
        vm.prank(founder);
        activity.registerFounder(pid);
        vm.startPrank(alice);
        activity.follow(founder);
        vm.expectRevert(abi.encodeWithSelector(FounderActivity.AlreadyFollowing.selector, founder));
        activity.follow(founder);
    }

    function test_UnfollowWithoutFollowingReverts() public {
        uint256 pid = createProject();
        vm.prank(founder);
        activity.registerFounder(pid);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(FounderActivity.NotFollowing.selector, founder));
        activity.unfollow(founder);
    }

    /// @dev Registers a second founder (owned by `addr`) so a follower can follow two of them.
    function _registerSecondFounder(address addr) internal returns (uint256 pid) {
        ProjectRegistry.CreateProjectParams memory params = ProjectRegistry.CreateProjectParams({
            title: "Second Founder Co",
            tagline: "t",
            metadataCid: "m",
            coverCid: "c",
            target: TARGET,
            claimPrice: CLAIM_PRICE,
            totalClaims: TOTAL_CLAIMS,
            fundingDeadline: uint64(block.timestamp + 14 days)
        });
        vm.prank(addr);
        pid = registry.createProject(params);
        vm.prank(addr);
        activity.registerFounder(pid);
    }

    function test_GetFollowingListsFollowedFounders() public {
        uint256 pid = createProject(); // founder owns
        uint256 pid2 = _registerSecondFounder(bob);
        vm.prank(founder);
        activity.registerFounder(pid);

        vm.startPrank(alice);
        activity.follow(founder);
        activity.follow(bob);

        address[] memory followed = activity.getFollowing(alice);
        assertEq(followed.length, 2);
        // Order is not guaranteed (swap-pop), so assert set membership.
        assertEq(followed[0], founder);
        assertEq(followed[1], bob);
    }

    function test_GetFollowingRemovesOnUnfollow() public {
        uint256 pid = createProject();
        uint256 pid2 = _registerSecondFounder(bob);
        vm.prank(founder);
        activity.registerFounder(pid);

        vm.startPrank(alice);
        activity.follow(founder);
        activity.follow(bob);
        activity.unfollow(founder);

        address[] memory followed = activity.getFollowing(alice);
        assertEq(followed.length, 1);
        assertEq(followed[0], bob);
        assertFalse(activity.isFollowing(alice, founder));
        assertTrue(activity.isFollowing(alice, bob));
    }

    function test_GetFollowingEmptyByDefault() public {
        assertEq(activity.getFollowing(alice).length, 0);
    }

    /* ---------------------------------------------------------------- *
     * profile
     * ---------------------------------------------------------------- */

    function test_SetProfileRequiresFounderThenStores() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FounderActivity.NotAFollowableFounder.selector, alice));
        activity.setProfile("ipfs://profile");

        uint256 pid = createProject();
        vm.startPrank(founder);
        activity.registerFounder(pid);
        activity.setProfile("ipfs://profile");

        (bool reg, string memory cid, uint256 followers, uint256 updates) = activity.getFounder(founder);
        assertTrue(reg);
        assertEq(cid, "ipfs://profile");
        assertEq(followers, 0);
        assertEq(updates, 0);
    }

    function test_SetProfileEmptyCidReverts() public {
        uint256 pid = createProject();
        vm.prank(founder);
        activity.registerFounder(pid);
        vm.prank(founder);
        vm.expectRevert(FounderActivity.EmptyCid.selector);
        activity.setProfile("");
    }

    /* ---------------------------------------------------------------- *
     * events
     * ---------------------------------------------------------------- */

    function test_UpdatePostedEvent() public {
        uint256 pid = createProject();
        vm.prank(founder);
        vm.expectEmit(true, true, true, false);
        emit FounderActivity.UpdatePosted(1, pid, founder, "ipfs://e", uint64(block.timestamp));
        activity.postUpdate(pid, "ipfs://e");
    }

    function test_FollowedAndUnfollowedEvents() public {
        uint256 pid = createProject();
        vm.prank(founder);
        activity.registerFounder(pid);

        vm.prank(alice);
        vm.expectEmit(true, true, false, false);
        emit FounderActivity.Followed(alice, founder);
        activity.follow(founder);

        vm.prank(alice);
        vm.expectEmit(true, true, false, false);
        emit FounderActivity.Unfollowed(alice, founder);
        activity.unfollow(founder);
    }
}
