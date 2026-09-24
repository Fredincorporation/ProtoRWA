// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { ProjectRegistry } from "../src/ProjectRegistry.sol";

/**
 * @notice Publishes the "HydroCore 600" atmospheric water generator on Robinhood
 *         Chain testnet with real, Filebase-pinned IPFS media (cover + metadata).
 *
 * Created to replace a retired duplicate showcase seed. Amounts are USDG
 * (6 decimals); native ETH is gas only. Requires PROJECT_REGISTRY + PRIVATE_KEY.
 */
contract PublishHydroCore is Script {
    uint256 internal constant USDG = 1e6;

    function run() external {
        uint256 founderKey = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("PROJECT_REGISTRY");

        ProjectRegistry registry = ProjectRegistry(payable(registryAddress));

        vm.startBroadcast(founderKey);

        // Raise: 18,000 USDG ($18,000). Claim price: 18 USDG. 1,000 claims.
        uint256 target = 18_000 * USDG;
        uint256 claimPrice = 18 * USDG;
        uint256 totalClaims = 1_000;
        uint64 deadline = uint64(block.timestamp + 60 days);

        uint256 projectId = registry.createProject(
            ProjectRegistry.CreateProjectParams({
                title: "HydroCore 600 Atmospheric Water Generator",
                tagline: "Solar-assisted atmospheric water generator producing up to 600 L/day of mineralized drinking water for off-grid communities.",
                metadataCid: "ipfs://Qmd4eZ3GHXQNH1DCVBLEJ6YpLLkB3HBkK7JYkjgX9Pm1Sy",
                coverCid: "ipfs://QmePmsJDgkYS6ujapaU2rN5FpN6REd8NuQ39Usa5pn82wE",
                target: target,
                claimPrice: claimPrice,
                totalClaims: totalClaims,
                fundingDeadline: deadline
            })
        );
        console2.log("HydroCore 600 created with Project ID:", projectId);

        ProjectRegistry.Milestone[] memory milestones = new ProjectRegistry.Milestone[](4);

        milestones[0] = ProjectRegistry.Milestone({
            title: "M1: Tooling & Condenser Assembly",
            description: "Injection-moulded housings and copper condenser coils tooled and first-article inspected.",
            trancheAmount: 5_400 * USDG,
            dueAt: uint64(block.timestamp + 20 days),
            votingPeriodSeconds: 3 days,
            approvalThresholdBps: 6000,
            quorumBps: 4000,
            status: ProjectRegistry.MilestoneStatus.PENDING
        });

        milestones[1] = ProjectRegistry.Milestone({
            title: "M2: EVT Units & Water-Quality Validation",
            description: "Fifty engineering units assembled; mineralization and UV-C post-treatment validated to NSF/ANSI 62.",
            trancheAmount: 5_400 * USDG,
            dueAt: uint64(block.timestamp + 40 days),
            votingPeriodSeconds: 3 days,
            approvalThresholdBps: 6000,
            quorumBps: 4000,
            status: ProjectRegistry.MilestoneStatus.PENDING
        });

        milestones[2] = ProjectRegistry.Milestone({
            title: "M3: Certification & Compliance",
            description: "Electrical safety and potable-water certification issued by an accredited lab for the production design.",
            trancheAmount: 3_600 * USDG,
            dueAt: uint64(block.timestamp + 60 days),
            votingPeriodSeconds: 3 days,
            approvalThresholdBps: 6000,
            quorumBps: 4000,
            status: ProjectRegistry.MilestoneStatus.PENDING
        });

        milestones[3] = ProjectRegistry.Milestone({
            title: "M4: Production Batch 1 & Fulfilment",
            description: "First 300 sellable units serialised, packaged, and handed to the freight forwarder.",
            trancheAmount: 3_600 * USDG,
            dueAt: uint64(block.timestamp + 80 days),
            votingPeriodSeconds: 3 days,
            approvalThresholdBps: 6000,
            quorumBps: 4000,
            status: ProjectRegistry.MilestoneStatus.PENDING
        });

        registry.setMilestones(projectId, milestones);
        registry.openFunding(projectId);
        console2.log("Funding opened for Project ID:", projectId);

        vm.stopBroadcast();
    }
}
