// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { ProjectRegistry } from "../src/ProjectRegistry.sol";

/**
 * @notice Publishes the "VoltPack 240" hardware project on Robinhood Chain testnet
 *         with real, Filebase-pinned IPFS media (cover, gallery, pitch video, metadata).
 *
 * All amounts are denominated in USDG (6 decimals), the protocol payment token;
 * native ETH is used only for gas. Requires PROJECT_REGISTRY (and PRIVATE_KEY)
 * in the environment, matching Deploy.sol / SeedLiveProject.sol.
 */
contract PublishVoltPack is Script {
    /// @dev USDG is a 6-decimal, USD-pegged token. 1 USDG = 1e6 base units = $1.
    uint256 internal constant USDG = 1e6;

    function run() external {
        uint256 founderKey = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("PROJECT_REGISTRY");

        ProjectRegistry registry = ProjectRegistry(payable(registryAddress));

        vm.startBroadcast(founderKey);

        // Raise: 25,000 USDG ($25,000). Claim price: 25 USDG. 1,000 claims.
        uint256 target = 25_000 * USDG;
        uint256 claimPrice = 25 * USDG;
        uint256 totalClaims = 1_000;
        uint64 deadline = uint64(block.timestamp + 60 days);

        ProjectRegistry.CreateProjectParams memory params = ProjectRegistry.CreateProjectParams({
            title: "VoltPack 240 Portable Power Station",
            tagline: "2,048 Wh LiFePO4 portable power station with a 2,400 W inverter and 500 W solar input.",
            metadataCid: "ipfs://QmVKRKhWipii5BYfQWxKWa6yvDgry3wsapfv7A7V8vuxsn",
            coverCid: "ipfs://QmU1TQgTLmrT8N9CDbkkKD6RtDZTXwkAjZtRKPSvbznvS5",
            target: target,
            claimPrice: claimPrice,
            totalClaims: totalClaims,
            fundingDeadline: deadline
        });

        uint256 projectId = registry.createProject(params);
        console2.log("VoltPack 240 created with Project ID:", projectId);

        // Milestones summing exactly to 25,000 USDG (30/30/20/20).
        ProjectRegistry.Milestone[] memory milestones = new ProjectRegistry.Milestone[](4);

        milestones[0] = ProjectRegistry.Milestone({
            title: "M1: Tooling & Injection-Moulded Housings",
            description: "CNC-machined steel tooling for the enclosure delivered and first-article inspected.",
            trancheAmount: 7_500 * USDG,
            dueAt: uint64(block.timestamp + 20 days),
            votingPeriodSeconds: 3 days,
            approvalThresholdBps: 6000,
            quorumBps: 4000,
            status: ProjectRegistry.MilestoneStatus.PENDING
        });

        milestones[1] = ProjectRegistry.Milestone({
            title: "M2: EVT Assembly & Battery Validation",
            description: "First 50 engineering units assembled; 3,000-cycle LiFePO4 pack and BMS validated on bench.",
            trancheAmount: 7_500 * USDG,
            dueAt: uint64(block.timestamp + 40 days),
            votingPeriodSeconds: 3 days,
            approvalThresholdBps: 6000,
            quorumBps: 4000,
            status: ProjectRegistry.MilestoneStatus.PENDING
        });

        milestones[2] = ProjectRegistry.Milestone({
            title: "M3: UL / CE Certification",
            description: "Safety and EMC certification reports issued by an accredited lab for the production design.",
            trancheAmount: 5_000 * USDG,
            dueAt: uint64(block.timestamp + 60 days),
            votingPeriodSeconds: 3 days,
            approvalThresholdBps: 6000,
            quorumBps: 4000,
            status: ProjectRegistry.MilestoneStatus.PENDING
        });

        milestones[3] = ProjectRegistry.Milestone({
            title: "M4: Production Batch 1 & Fulfilment",
            description: "First 500 sellable units packaged, serialised, and handed to the freight forwarder.",
            trancheAmount: 5_000 * USDG,
            dueAt: uint64(block.timestamp + 80 days),
            votingPeriodSeconds: 3 days,
            approvalThresholdBps: 6000,
            quorumBps: 4000,
            status: ProjectRegistry.MilestoneStatus.PENDING
        });

        registry.setMilestones(projectId, milestones);
        console2.log("Milestones set (total = 25,000 USDG)");

        registry.openFunding(projectId);
        console2.log("Funding opened for Project ID:", projectId);

        vm.stopBroadcast();
    }
}
