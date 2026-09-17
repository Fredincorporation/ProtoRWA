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
}

const env = (key: string): Address | undefined => {
  const value = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : undefined;
};

/** Registry of deployed addresses keyed by chain id. */
export const contractAddresses: Record<number, Partial<ProtocolContracts>> = {
  // Robinhood Chain (id supplied at deploy time)
  ...(env('NEXT_PUBLIC_ROBINHOOD_CHAIN_ID')
    ? {
        [Number(env('NEXT_PUBLIC_ROBINHOOD_CHAIN_ID'))]: {
          projectRegistry: env('NEXT_PUBLIC_ROBINHOOD_PROJECT_REGISTRY'),
          claimToken: env('NEXT_PUBLIC_ROBINHOOD_CLAIM_TOKEN'),
          milestoneEscrow: env('NEXT_PUBLIC_ROBINHOOD_MILESTONE_ESCROW'),
          secondaryMarket: env('NEXT_PUBLIC_ROBINHOOD_SECONDARY_MARKET'),
        },
      }
    : {}),
  // Arbitrum Sepolia
  421614: {
    projectRegistry: env('NEXT_PUBLIC_ARB_SEPOLIA_PROJECT_REGISTRY'),
    claimToken: env('NEXT_PUBLIC_ARB_SEPOLIA_CLAIM_TOKEN'),
    milestoneEscrow: env('NEXT_PUBLIC_ARB_SEPOLIA_MILESTONE_ESCROW'),
    secondaryMarket: env('NEXT_PUBLIC_ARB_SEPOLIA_SECONDARY_MARKET'),
    hardwareVerifier: env('NEXT_PUBLIC_ARB_SEPOLIA_HARDWARE_VERIFIER'),
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
