// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

import { ClaimToken } from "../src/ClaimToken.sol";
import { ProjectRegistry } from "../src/ProjectRegistry.sol";
import { MilestoneEscrow } from "../src/MilestoneEscrow.sol";
import { SecondaryMarket } from "../src/SecondaryMarket.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Deploys the ProtoRWA protocol and wires roles between contracts.
 *
 * The role wiring is the part that is easy to get wrong by hand, so it is done
 * here in one place and asserted afterwards:
 *
 *   ClaimToken.MINTER_ROLE  -> ProjectRegistry   (mint on commit)
 *   ClaimToken.BURNER_ROLE  -> MilestoneEscrow   (burn on refund)
 *   ClaimToken.FREEZER_ROLE -> admin             (freeze during dispute)
 *
 * Usage:
 *   forge script/Deploy.sol --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast
 *
 * Required env:
 *   PRIVATE_KEY          deployer key (also becomes initial admin)
 *   PAYMENT_TOKEN        ERC-20 address, or omit for native ETH
 *   FEE_RECIPIENT        protocol fee beneficiary (defaults to admin)
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(deployerKey);

        address paymentToken = vm.envOr("PAYMENT_TOKEN", address(0));
        address feeRecipient = vm.envOr("FEE_RECIPIENT", admin);

        string memory baseUri = vm.envOr("CLAIM_TOKEN_BASE_URI", string("ipfs://protorwa/{id}.json"));
        string memory contractUri =
            vm.envOr("CLAIM_TOKEN_CONTRACT_URI", string("ipfs://protorwa/contract.json"));

        vm.startBroadcast(deployerKey);

        ClaimToken claimToken = new ClaimToken(admin, baseUri, contractUri);
        ProjectRegistry registry = new ProjectRegistry(admin, claimToken, IERC20(paymentToken));
        MilestoneEscrow escrow = new MilestoneEscrow(admin, registry, claimToken, IERC20(paymentToken));
        SecondaryMarket market = new SecondaryMarket(
            admin,
            claimToken,
            registry,
            escrow,
            IERC20(paymentToken),
            feeRecipient
        );

        // Registry must be able to mint claims and deposit into escrow.
        registry.setEscrow(address(escrow));
        claimToken.grantRole(claimToken.MINTER_ROLE(), address(registry));
        claimToken.grantRole(claimToken.BURNER_ROLE(), address(escrow));
        claimToken.grantRole(claimToken.FREEZER_ROLE(), admin);

        vm.stopBroadcast();

        _report(
            admin,
            paymentToken,
            address(claimToken),
            address(registry),
            address(escrow),
            address(market)
        );
    }

    /// @dev Prints a ready-to-paste .env block so the frontend can be configured.
    function _report(
        address admin,
        address paymentToken,
        address claimToken,
        address registry,
        address escrow,
        address market
    ) private pure {
        console2.log("");
        console2.log("ProtoRWA deployed -------------------------------------------------");
        console2.log("admin            ", admin);
        console2.log("paymentToken     ", paymentToken == address(0) ? "native ETH" : "");
        if (paymentToken != address(0)) console2.log("  token address  ", paymentToken);
        console2.log("ClaimToken       ", claimToken);
        console2.log("ProjectRegistry  ", registry);
        console2.log("MilestoneEscrow  ", escrow);
        console2.log("SecondaryMarket  ", market);
        console2.log("");
        console2.log("Paste into frontend/.env.local:");
        console2.log(string.concat("NEXT_PUBLIC_PROJECT_REGISTRY=", vm.toString(registry)));
        console2.log(string.concat("NEXT_PUBLIC_CLAIM_TOKEN=", vm.toString(claimToken)));
        console2.log(string.concat("NEXT_PUBLIC_MILESTONE_ESCROW=", vm.toString(escrow)));
        console2.log(string.concat("NEXT_PUBLIC_SECONDARY_MARKET=", vm.toString(market)));
        console2.log("-------------------------------------------------------------------");
    }
}
