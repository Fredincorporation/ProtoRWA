// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

import { FounderActivity, IProjectRegistry } from "../src/FounderActivity.sol";

/**
 * @notice Deploys the FounderActivity social contract against an ALREADY-LIVE
 *         registry. Standalone by design: it never touches the money contracts,
 *         so this can be broadcast without a full protocol redeploy.
 *
 * Usage (Robinhood Chain testnet):
 *   forge script "script/DeployFounderActivity.sol:DeployFounderActivity" \
 *     --rpc-url https://rpc.testnet.chain.robinhood.com --broadcast
 *
 * Required env:
 *   PRIVATE_KEY        deployer key (holds testnet ETH for gas)
 *   PROJECT_REGISTRY   address of the live ProjectRegistry to point at
 */
contract DeployFounderActivity is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address registry = vm.envAddress("PROJECT_REGISTRY");

        vm.startBroadcast(deployerKey);
        FounderActivity activity = new FounderActivity(IProjectRegistry(registry));
        vm.stopBroadcast();

        console2.log("");
        console2.log("FounderActivity deployed -----------------------------------------");
        console2.log("registry  ", registry);
        console2.log("address   ", address(activity));
        console2.log("");
        console2.log("Paste into frontend/.env.local:");
        console2.log(string.concat("NEXT_PUBLIC_FOUNDER_ACTIVITY=", vm.toString(address(activity))));
        console2.log("-------------------------------------------------------------------");
    }
}
