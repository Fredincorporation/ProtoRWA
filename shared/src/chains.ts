/**
 * Chain configuration.
 *
 * Primary target is Robinhood Chain; Arbitrum Sepolia is the fallback used for
 * development and if the primary is unavailable at demo time.
 *
 * NOTE: Robinhood Chain's public chain id / RPC are supplied via environment
 * variables rather than hardcoded, because they are not guaranteed stable and
 * differ between deployments. Fill them in .env.local when you have them.
 */

export interface ChainConfig {
  id: number;
  name: string;
  /** Short label for UI badges. */
  shortName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrl: string;
  blockExplorerUrl: string | null;
  testnet: boolean;
}

const env = (key: string, fallback = '') =>
  (typeof process !== 'undefined' ? process.env?.[key] : undefined) ?? fallback;

export const robinhoodChain: ChainConfig = {
  id: Number(env('NEXT_PUBLIC_ROBINHOOD_CHAIN_ID', '0')),
  name: 'Robinhood Chain',
  shortName: 'Robinhood',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrl: env('NEXT_PUBLIC_ROBINHOOD_RPC_URL'),
  blockExplorerUrl: env('NEXT_PUBLIC_ROBINHOOD_EXPLORER_URL') || null,
  testnet: false,
};

export const arbitrumSepolia: ChainConfig = {
  id: 421614,
  name: 'Arbitrum Sepolia',
  shortName: 'Arb Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrl: env('NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL', 'https://sepolia-rollup.arbitrum.io/rpc'),
  blockExplorerUrl: 'https://sepolia.arbiscan.io',
  testnet: true,
};

/** Chains the app will attempt to connect to, in priority order. */
export const supportedChains: ChainConfig[] = [robinhoodChain, arbitrumSepolia].filter(
  (chain) => chain.id !== 0 || chain.name === 'Robinhood Chain',
);

/** The chain the app defaults to. */
export const defaultChain: ChainConfig =
  robinhoodChain.id !== 0 ? robinhoodChain : arbitrumSepolia;

export function getChain(id: number): ChainConfig | undefined {
  return supportedChains.find((chain) => chain.id === id);
}

export function explorerTxUrl(chainId: number, txHash: string): string | null {
  const chain = getChain(chainId);
  if (!chain?.blockExplorerUrl) return null;
  return `${chain.blockExplorerUrl}/tx/${txHash}`;
}

export function explorerAddressUrl(chainId: number, address: string): string | null {
  const chain = getChain(chainId);
  if (!chain?.blockExplorerUrl) return null;
  return `${chain.blockExplorerUrl}/address/${address}`;
}

/* ------------------------------------------------------------------ *
 * Protocol constants
 * ------------------------------------------------------------------ */

export const PROTOCOL = {
  /** Basis points denominator. */
  BPS_DENOMINATOR: 10_000,
  /** Default milestone approval threshold (60%). */
  DEFAULT_APPROVAL_THRESHOLD_BPS: 6_000,
  /** Default quorum (25% of eligible claim weight). */
  DEFAULT_QUORUM_BPS: 2_500,
  /** Default evidence review window. */
  DEFAULT_VOTING_PERIOD_SECONDS: 7 * 24 * 60 * 60,
  /** Protocol fee taken on secondary sales, in bps. */
  SECONDARY_FEE_BPS: 100,
  /** Maximum milestone tranches per project. */
  MAX_MILESTONES: 12,
} as const;

/** Human-readable label for a chain, for wallet UI. */
export function chainLabel(chainId: number | undefined): string {
  if (chainId === undefined) return 'Not connected';
  return getChain(chainId)?.shortName ?? `Chain ${chainId}`;
}
