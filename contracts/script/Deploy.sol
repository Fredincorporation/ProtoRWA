// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

import { ClaimToken } from "../src/ClaimToken.sol";
import { ProjectRegistry } from "../src/ProjectRegistry.sol";
import { MilestoneEscrow } from "../src/MilestoneEscrow.sol";
import { SecondaryMarket } from "../src/SecondaryMarket.sol";
import { IHardwareVerifier } from "../src/IHardwareVerifier.sol";
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
 * Usage (Robinhood Chain testnet; settlement is USDG, gas is native ETH):
 *   forge script "script/Deploy.sol:Deploy" \
 *     --rpc-url https://rpc.testnet.chain.robinhood.com --broadcast
 *
 * Required env:
 *   PRIVATE_KEY          deployer key (also becomes initial admin); holds testnet ETH for gas
 *   PAYMENT_TOKEN        USDG (6-decimal) address used for all settlement
 *   FEE_RECIPIENT        protocol fee beneficiary (defaults to admin)
 * Optional env:
 *   HARDWARE_VERIFIER    deployed Stylus HardwareVerifier address. When set, the
 *                        escrow gates hardware-committed milestones on its
 *                        Merkle proof. Defaults to address(0), which disables
 *                        attestation and keeps every milestone non-gated.
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(deployerKey);

        address paymentToken = vm.envOr("PAYMENT_TOKEN", address(0));
        address feeRecipient = vm.envOr("FEE_RECIPIENT", admin);
        address hardwareVerifier = vm.envOr("HARDWARE_VERIFIER", address(0));

        string memory baseUri = vm.envOr("CLAIM_TOKEN_BASE_URI", string("ipfs://protorwa/{id}.json"));
        string memory contractUri =
            vm.envOr("CLAIM_TOKEN_CONTRACT_URI", string("ipfs://protorwa/contract.json"));

        vm.startBroadcast(deployerKey);

        ClaimToken claimToken = new ClaimToken(admin, baseUri, contractUri);
        ProjectRegistry registry = new ProjectRegistry(admin, claimToken, IERC20(paymentToken));
        MilestoneEscrow escrow = new MilestoneEscrow(
            admin,
            registry,
            claimToken,
            IERC20(paymentToken),
            IHardwareVerifier(hardwareVerifier)
        );
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
            hardwareVerifier,
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
        address hardwareVerifier,
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
        console2.log(
            "hardwareVerifier ",
            hardwareVerifier == address(0) ? "disabled (no attestation)" : vm.toString(hardwareVerifier)
        );
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
