/**
 * Chain configuration.
 *
 * Robinhood Chain is a first-class target alongside Arbitrum; Arbitrum Sepolia
 * remains the development default because it is where the current contracts are
 * deployed.
 *
 * The Robinhood Chain parameters below were VERIFIED against the live endpoints
 * rather than copied from documentation - each RPC was sent `eth_chainId` and
 * returned the expected value. Hardcoding them is safe because they are now
 * publicly published infrastructure, not a per-deployment secret. Every value is
 * still overridable by environment variable so a redeploy or an RPC migration
 * does not require a code change.
 *
 *   mainnet  eth_chainId -> 0x1237 (4663)   rpc.mainnet.chain.robinhood.com
 *   testnet  eth_chainId -> 0xb626 (46630)  rpc.testnet.chain.robinhood.com
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
  /**
   * Path segment the explorer uses for transactions.
   *
   * Block explorers are not uniform: Arbiscan uses `/tx/` and `/address/`, while
   * Blockscout (which Robinhood Chain runs) uses `/tx/` and `/address/` too but
   * varies by deployment. Kept per-chain rather than assumed, so adding a chain
   * cannot silently produce links that 404.
   */
  explorerPaths?: { tx: string; address: string };
  /**
   * USDG (Paxos Global Dollar) on this chain, when deployed.
   *
   * Present because Robinhood Chain quotes RWA settlement against USDG rather
   * than USDC, and because the escrow can denominate tranches in USDG. Verified
   * on-chain for each entry: symbol() === 'USDG', decimals() === 6.
   */
  usdg?: string;
}

const env = (key: string, fallback = '') =>
  (typeof process !== 'undefined' ? process.env?.[key] : undefined) ?? fallback;

/** Verified Robinhood Chain mainnet (launched 2026-07-01). */
export const robinhoodChain: ChainConfig = {
  id: Number(env('NEXT_PUBLIC_ROBINHOOD_CHAIN_ID', '4663')),
  name: 'Robinhood Chain',
  shortName: 'Robinhood',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrl: env('NEXT_PUBLIC_ROBINHOOD_RPC_URL', 'https://rpc.mainnet.chain.robinhood.com'),
  blockExplorerUrl:
    env('NEXT_PUBLIC_ROBINHOOD_EXPLORER_URL') || 'https://robinhoodchain.blockscout.com',
  testnet: false,
  // Verified against mainnet RPC: symbol() === 'USDG', name() === 'Global Dollar',
  // decimals() === 6. Source: Paxos USDG mainnet address table.
  usdg: env('NEXT_PUBLIC_ROBINHOOD_USDG', '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'),
};

/**
 * Robinhood Chain testnet (chain id 46630).
 *
 * Useful for a demo that needs a faucet without spending real ETH. The USDG
 * address here is confirmed on-chain, so a USDG-denominated flow can be
 * exercised end-to-end without mainnet funds.
 */
export const robinhoodTestnet: ChainConfig = {
  id: Number(env('NEXT_PUBLIC_ROBINHOOD_TESTNET_CHAIN_ID', '46630')),
  name: 'Robinhood Testnet',
  shortName: 'Robinhood Test',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrl: env('NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL', 'https://rpc.testnet.chain.robinhood.com'),
  blockExplorerUrl:
    env('NEXT_PUBLIC_ROBINHOOD_TESTNET_EXPLORER_URL') || 'https://explorer.testnet.chain.robinhood.com',
  testnet: true,
  // Verified: symbol() === 'USDG', decimals() === 6.
  usdg: env('NEXT_PUBLIC_ROBINHOOD_TESTNET_USDG', '0x7E955252E15c84f5768B83c41a71F9eba181802F'),
};

export const arbitrumSepolia: ChainConfig = {
  id: 421614,
  name: 'Arbitrum Sepolia',
  shortName: 'Arb Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrl: env('NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL', 'https://sepolia-rollup.arbitrum.io/rpc'),
  blockExplorerUrl: 'https://sepolia.arbiscan.io',
  testnet: true,
  // Verified: name() === 'Global Dollar', symbol() === 'USDG', decimals() === 6.
  usdg: env('NEXT_PUBLIC_ARB_SEPOLIA_USDG', '0xFFC95faa3d63Cde504a05B567C600B78C0b41892'),
  explorerPaths: { tx: 'tx', address: 'address' },
};

/** Arbitrum One. Mainnet target for the Solidity deployment. */
export const arbitrumOne: ChainConfig = {
  id: 42161,
  name: 'Arbitrum One',
  shortName: 'Arbitrum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrl: env('NEXT_PUBLIC_ARBITRUM_ONE_RPC_URL', 'https://arb1.arbitrum.io/rpc'),
  blockExplorerUrl: 'https://arbiscan.io',
  testnet: false,
};

/**
 * Chains the app will connect to, in priority order.
 *
 * Order matters: it is the order wagmi offers and the order the wallet prompts
 * list. Robinhood Chain leads because it is the primary integration target.
 */
export const supportedChains: ChainConfig[] = [
  robinhoodChain,
  arbitrumOne,
  arbitrumSepolia,
  robinhoodTestnet,
];

/**
 * The chain the app defaults to.
 *
 * Robinhood Chain testnet. The protocol is deployed there and denominated in
 * USDG, so it is where the app should open. This previously defaulted to
 * Arbitrum Sepolia and the header advertised it on every screen while the
 * contracts lived on a different chain entirely.
 *
 * Overridable for a deployment that targets somewhere else:
 *   NEXT_PUBLIC_DEFAULT_CHAIN=arbitrum-sepolia | robinhood | robinhood-testnet
 */
const DEFAULT_CHAIN_ENV = env('NEXT_PUBLIC_DEFAULT_CHAIN');

export const defaultChain: ChainConfig =
  DEFAULT_CHAIN_ENV === 'arbitrum-sepolia'
    ? arbitrumSepolia
    : DEFAULT_CHAIN_ENV === 'robinhood'
      ? robinhoodChain
      : robinhoodTestnet;

/** The chain used for short-lived demo flows (USDG has a verified faucet token). */
export const demoChain: ChainConfig = arbitrumSepolia;

export function getChain(id: number): ChainConfig | undefined {
  return supportedChains.find((chain) => chain.id === id);
}

/**
 * Explorer link for a transaction on the given chain.
 *
 * Returns null rather than a guessed URL when the chain has no explorer, or when
 * it is not a supported chain. A link that 404s is worse than no link: it looks
 * like the transaction does not exist.
 */
export function explorerTxUrl(chainId: number, txHash: string): string | null {
  const chain = getChain(chainId);
  if (!chain?.blockExplorerUrl) return null;
  const path = chain.explorerPaths?.tx ?? 'tx';
  return `${chain.blockExplorerUrl}/${path}/${txHash}`;
}

export function explorerAddressUrl(chainId: number, address: string): string | null {
  const chain = getChain(chainId);
  if (!chain?.blockExplorerUrl) return null;
  const path = chain.explorerPaths?.address ?? 'address';
  return `${chain.blockExplorerUrl}/${path}/${address}`;
}

/** Explorer link for a transaction on the chain the protocol is deployed on. */
export function protocolTxUrl(txHash: string): string | null {
  return explorerTxUrl(defaultChain.id, txHash);
}

/** Explorer link for an address on the chain the protocol is deployed on. */
export function protocolAddressUrl(address: string): string | null {
  return explorerAddressUrl(defaultChain.id, address);
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
