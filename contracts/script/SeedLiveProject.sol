// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { ProjectRegistry } from "../src/ProjectRegistry.sol";

/**
 * @notice Seeds the first real on-chain hardware project (HelioFrost Pro) on Robinhood Chain testnet.
 *
 * All amounts are denominated in USDG (6 decimals), the protocol payment token;
 * native ETH is used only for gas. See Deploy.sol, which must run first to
 * provide PROJECT_REGISTRY.
 *
 * This turns ProtoRWA from a static frontend into a live testnet dApp with:
 * - A real project id assigned by the freshly deployed ProjectRegistry
 * - Status = FUNDING
 * - 4 defined on-chain milestones summing exactly to the funding target
 * - Commitments that transfer USDG, mint real ClaimTokens and forward USDG to MilestoneEscrow
 */
contract SeedLiveProject is Script {
    /// @dev USDG is a 6-decimal, USD-pegged token. 1 USDG = 1e6 base units = $1.
    uint256 internal constant USDG = 1e6;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("PROJECT_REGISTRY");

        ProjectRegistry registry = ProjectRegistry(payable(registryAddress));

        vm.startBroadcast(deployerKey);

        // 1. Create HelioFrost Pro
        // Total target: 5,000 USDG ($5,000). Claim price: 5 USDG ($5). 1,000 claims.
        uint256 target = 5_000 * USDG;
        uint256 claimPrice = 5 * USDG;
        uint256 totalClaims = 1_000;
        uint64 deadline = uint64(block.timestamp + 60 days);

        ProjectRegistry.CreateProjectParams memory params = ProjectRegistry.CreateProjectParams({
            title: "HelioFrost Pro",
            tagline: "Ultra-efficient thermoelectric cold-storage cooler for off-grid fieldwork and vaccines.",
            metadataCid: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
            coverCid: "ipfs://bafybeih4j6z22z4a2g3a2a6b2a5a2a6b2a5a2a6b2a5a2a6b2a5a2a6b2a",
            target: target,
            claimPrice: claimPrice,
            totalClaims: totalClaims,
            fundingDeadline: deadline
        });

        uint256 projectId = registry.createProject(params);
        console2.log("HelioFrost Pro created with Project ID:", projectId);

        // 2. Set Milestone Schedule totaling exactly 5,000 USDG (30/30/20/20)
        ProjectRegistry.Milestone[] memory milestones = new ProjectRegistry.Milestone[](4);

        // Milestone 1: Tooling & Mould Fabrication (1,500 USDG = 30%)
        milestones[0] = ProjectRegistry.Milestone({
            title: "M1: Tooling & Injection Moulds",
            description: "CNC machined aluminum injection tooling delivered and certified by factory QA.",
            trancheAmount: 1_500 * USDG,
            dueAt: uint64(block.timestamp + 20 days),
            votingPeriodSeconds: 3 days,
            approvalThresholdBps: 6000, // 60%
            quorumBps: 4000,            // 40%
            status: ProjectRegistry.MilestoneStatus.PENDING
        });

        // Milestone 2: EVT Assembly & Sensor Calibration (1,500 USDG = 30%)
        milestones[1] = ProjectRegistry.Milestone({
            title: "M2: EVT Assembly & Telemetry Verification",
            description: "First 50 engineering verification test units assembled with calibrated thermal sensors.",
            trancheAmount: 1_500 * USDG,
            dueAt: uint64(block.timestamp + 40 days),
            votingPeriodSeconds: 3 days,
            approvalThresholdBps: 6000,
            quorumBps: 4000,
            status: ProjectRegistry.MilestoneStatus.PENDING
        });

        // Milestone 3: Factory Mass Production Batch 1 (1,000 USDG = 20%)
        milestones[2] = ProjectRegistry.Milestone({
            title: "M3: Production Batch 1",
            description: "First 500 consumer production units packaged and palletized with serial attestation.",
            trancheAmount: 1_000 * USDG,
            dueAt: uint64(block.timestamp + 60 days),
            votingPeriodSeconds: 3 days,
            approvalThresholdBps: 6000,
            quorumBps: 4000,
            status: ProjectRegistry.MilestoneStatus.PENDING
        });

        // Milestone 4: Global Fulfillment & Logistics Handover (1,000 USDG = 20%)
        milestones[3] = ProjectRegistry.Milestone({
            title: "M4: Global Logistics Handover",
            description: "Customs clearance docs, DHL freight bill of lading, and delivery tracking dispatch.",
            trancheAmount: 1_000 * USDG,
            dueAt: uint64(block.timestamp + 80 days),
            votingPeriodSeconds: 3 days,
            approvalThresholdBps: 6000,
            quorumBps: 4000,
            status: ProjectRegistry.MilestoneStatus.PENDING
        });

        registry.setMilestones(projectId, milestones);
        console2.log("Milestones set successfully");

        // 3. Open Funding
        registry.openFunding(projectId);
        console2.log("Funding opened for Project ID:", projectId);

        vm.stopBroadcast();
    }
}

