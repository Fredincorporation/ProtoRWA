/**
 * Contract addresses per chain.
 *
 * Populated from NEXT_PUBLIC_* env vars so a deployment can be swapped without
 * a rebuild of the source. Values are emitted by the Foundry deploy script.
 */

import type { Address } from '../types/index.js';

export interface ProtocolContracts {
  projectRegistry: Address;
  claimToken: Address;
  milestoneEscrow: Address;
  secondaryMarket: Address;
  hardwareVerifier?: Address;
  /**
   * Standalone social contract (founder profiles, updates, follows). Deployed
   * independently against the registry, so it is optional and never part of the
   * `isDeployed` gate — the money flow must work even with no activity contract.
   */
  founderActivity?: Address;
}

/**
 * Validate an env-supplied address.
 *
 * Callers MUST pass a *static* `process.env.NEXT_PUBLIC_*` member expression,
 * never a computed key like `process.env[key]`. Next inlines only the static
 * form into the client bundle; a dynamic lookup resolves on the server (real
 * `process.env`) but is `undefined` in the browser, which would make the client
 * believe nothing is deployed and diverge from the server render (hydration
 * mismatch) and silently disable every on-chain read.
 */
const addr = (value: string | undefined): Address | undefined =>
  value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : undefined;

/**
 * Registry of deployed addresses keyed by chain id.
 *
 * Every entry is env-driven with NO hardcoded fallback address. That is
 * deliberate: a baked-in address would keep resolving to a previous deployment
 * after a redeploy, and would report "deployed" for a chain where nothing has
 * been broadcast - the failure mode looks like a working app pointing at stale
 * contracts. An absent value renders as "not deployed", which is true.
 *
 * Robinhood Chain mainnet (4663) and testnet (46630) are both registered so a
 * deploy to either is picked up without a code change.
 */
export const contractAddresses: Record<number, Partial<ProtocolContracts>> = {
  // Robinhood Chain mainnet (verified chain id 4663).
  4663: {
    projectRegistry: addr(process.env.NEXT_PUBLIC_ROBINHOOD_PROJECT_REGISTRY),
    claimToken: addr(process.env.NEXT_PUBLIC_ROBINHOOD_CLAIM_TOKEN),
    milestoneEscrow: addr(process.env.NEXT_PUBLIC_ROBINHOOD_MILESTONE_ESCROW),
    secondaryMarket: addr(process.env.NEXT_PUBLIC_ROBINHOOD_SECONDARY_MARKET),
    hardwareVerifier: addr(process.env.NEXT_PUBLIC_ROBINHOOD_HARDWARE_VERIFIER),
    founderActivity: addr(process.env.NEXT_PUBLIC_ROBINHOOD_FOUNDER_ACTIVITY),
  },

  // Robinhood Chain testnet (verified chain id 46630). The USDG-denominated
  // deployment: all five contracts are live and functional, including the Stylus
  // HardwareVerifier, so the full flow can be exercised without real funds.
  //
  // The verifier's exported methods are camelCase (evaluateConsensus,
  // isTelemetryVerified), not the snake_case Rust identifiers. Calling the Rust
  // spelling reverts with empty data, which is indistinguishable from a dead
  // contract - always check `cargo stylus export-abi` before concluding failure.
  46630: {
    projectRegistry: addr(process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_PROJECT_REGISTRY),
    claimToken: addr(process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_CLAIM_TOKEN),
    milestoneEscrow: addr(process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_MILESTONE_ESCROW),
    secondaryMarket: addr(process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_SECONDARY_MARKET),
    hardwareVerifier: addr(process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_HARDWARE_VERIFIER),
    founderActivity: addr(process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_FOUNDER_ACTIVITY),
  },

  // Arbitrum Sepolia - current production demo deployment.
  421614: {
    projectRegistry: addr(process.env.NEXT_PUBLIC_ARB_SEPOLIA_PROJECT_REGISTRY),
    claimToken: addr(process.env.NEXT_PUBLIC_ARB_SEPOLIA_CLAIM_TOKEN),
    milestoneEscrow: addr(process.env.NEXT_PUBLIC_ARB_SEPOLIA_MILESTONE_ESCROW),
    secondaryMarket: addr(process.env.NEXT_PUBLIC_ARB_SEPOLIA_SECONDARY_MARKET),
    hardwareVerifier: addr(process.env.NEXT_PUBLIC_ARB_SEPOLIA_HARDWARE_VERIFIER),
    founderActivity: addr(process.env.NEXT_PUBLIC_ARB_SEPOLIA_FOUNDER_ACTIVITY),
  },

  // Arbitrum One - mainnet target.
  42161: {
    projectRegistry: addr(process.env.NEXT_PUBLIC_ARB_ONE_PROJECT_REGISTRY),
    claimToken: addr(process.env.NEXT_PUBLIC_ARB_ONE_CLAIM_TOKEN),
    milestoneEscrow: addr(process.env.NEXT_PUBLIC_ARB_ONE_MILESTONE_ESCROW),
    secondaryMarket: addr(process.env.NEXT_PUBLIC_ARB_ONE_SECONDARY_MARKET),
    hardwareVerifier: addr(process.env.NEXT_PUBLIC_ARB_ONE_HARDWARE_VERIFIER),
    founderActivity: addr(process.env.NEXT_PUBLIC_ARB_ONE_FOUNDER_ACTIVITY),
  },
};

export function getContracts(chainId: number): Partial<ProtocolContracts> {
  return contractAddresses[chainId] ?? {};
}

/** True when every protocol contract is configured for the chain. */
export function isDeployed(chainId: number): boolean {
  const addresses = getContracts(chainId);
  return Boolean(
    addresses.projectRegistry &&
      addresses.claimToken &&
      addresses.milestoneEscrow &&
      addresses.secondaryMarket,
  );
}
