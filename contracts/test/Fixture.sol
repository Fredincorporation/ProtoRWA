// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ClaimToken } from "../src/ClaimToken.sol";
import { ProjectRegistry } from "../src/ProjectRegistry.sol";
import { MilestoneEscrow } from "../src/MilestoneEscrow.sol";
import { SecondaryMarket } from "../src/SecondaryMarket.sol";
import { IHardwareVerifier } from "../src/IHardwareVerifier.sol";
import { MockHardwareVerifier } from "./mocks/MockHardwareVerifier.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Shared deployment fixture and helpers for the ProtoRWA suite.
 * @dev Uses native ETH as the payment token (address(0)) so the money paths are
 *      exercised without an ERC-20 mock.
 */
abstract contract Fixture is Test {
    ClaimToken internal claimToken;
    ProjectRegistry internal registry;
    MilestoneEscrow internal escrow;
    SecondaryMarket internal market;
    MockHardwareVerifier internal verifier;

    address internal admin = makeAddr("admin");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal founder = makeAddr("founder");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant TARGET = 100 ether;
    uint256 internal constant CLAIM_PRICE = 0.01 ether;
    uint256 internal constant TOTAL_CLAIMS = 10_000;
    uint256 internal constant VOTING_PERIOD = 7 days;

    function setUp() public virtual {
        claimToken = new ClaimToken(admin, "ipfs://base/{id}.json", "ipfs://contract.json");
        registry = new ProjectRegistry(admin, claimToken, IERC20(address(0)));
        verifier = new MockHardwareVerifier();
        escrow = new MilestoneEscrow(
            admin, registry, claimToken, IERC20(address(0)), IHardwareVerifier(address(verifier))
        );
        market = new SecondaryMarket(
            admin,
            claimToken,
            registry,
            escrow,
            IERC20(address(0)),
            feeRecipient
        );

        vm.startPrank(admin);
        registry.setEscrow(address(escrow));
        claimToken.grantRole(claimToken.MINTER_ROLE(), address(registry));
        claimToken.grantRole(claimToken.BURNER_ROLE(), address(escrow));
        claimToken.grantRole(claimToken.FREEZER_ROLE(), admin);
        vm.stopPrank();

        vm.deal(founder, 1_000 ether);
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
        vm.deal(carol, 1_000 ether);

        // Reviews should not be forced to wait a week in tests.
        vm.warp(1_700_000_000);
    }

    /* ------------------------------------------------------------------ *
     * Helpers
     * ------------------------------------------------------------------ */

    /// @notice Creates a project with a two-milestone schedule (60/40 split).
    function createProject() internal returns (uint256 projectId) {
        ProjectRegistry.CreateProjectParams memory params = ProjectRegistry.CreateProjectParams({
            title: "HelioFrost Pro",
            tagline: "Passive solar compute node",
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
            trancheAmount: 60 ether,
            dueAt: uint64(block.timestamp + 30 days),
            votingPeriodSeconds: uint32(VOTING_PERIOD),
            approvalThresholdBps: 6_000,
            quorumBps: 2_500,
            status: ProjectRegistry.MilestoneStatus.PENDING
        });
        milestones[1] = ProjectRegistry.Milestone({
            title: "Production & shipping",
            description: "Batch produced and shipped",
            trancheAmount: 40 ether,
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

    /// @notice Commits capital as `investor` and indexes them for snapshots.
    function commit(uint256 projectId, address investor, uint256 claims) internal {
        uint256 cost = claims * CLAIM_PRICE;
        vm.prank(investor);
        registry.commit{ value: cost }(projectId, claims);
        escrow.registerParticipant(projectId, investor);
    }

    /// @notice Funds a project to its target so funding can be settled.
    function fundToTarget(uint256 projectId) internal {
        commit(projectId, alice, 6_000);
        commit(projectId, bob, 3_000);
        commit(projectId, carol, 1_000);
    }

    /// @notice Advances past the funding deadline and settles into production.
    function settleToProduction(uint256 projectId) internal {
        vm.warp(block.timestamp + 15 days);
        registry.settleFunding(projectId);
    }

    /// @notice Full happy path: funded project ready for milestone evidence.
    function fundedProject() internal returns (uint256 projectId) {
        projectId = createProject();
        fundToTarget(projectId);
        settleToProduction(projectId);
    }
}
