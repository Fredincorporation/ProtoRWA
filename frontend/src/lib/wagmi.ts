/**
 * wagmi / chain configuration.
 *
 * Chain ids and RPC URLs come from the shared package (env-driven) so the app
 * targets the USDG-denominated Robinhood Chain deployment.
 */

import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  coinbaseWallet as rainbowCoinbaseWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { http, createConfig } from 'wagmi';
import type { Chain } from 'viem';

import { robinhoodChain, robinhoodTestnet } from '@protorwa/shared';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '';
export const walletConnectEnabled = projectId.length > 0;

/**
 * Bridges a shared `ChainConfig` into the viem `Chain` shape wagmi requires.
 *
 * Kept as a function because there are two Robinhood chains: duplicating this
 * object literal per chain is how they drift apart.
 */
function toWagmiChain(config: typeof robinhoodChain): Chain {
  return {
    id: config.id,
    name: config.name,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: {
      default: { http: [config.rpcUrl] },
      public: { http: [config.rpcUrl] },
    },
    blockExplorers: config.blockExplorerUrl
      ? { default: { name: `${config.name} Explorer`, url: config.blockExplorerUrl } }
      : undefined,
    testnet: config.testnet,
  };
}

/**
 * Robinhood Chain (mainnet, id 4663).
 *
 * Now always defined rather than conditional on an env var: the public chain id
 * and RPC are published infrastructure, and both endpoints were confirmed to
 * answer `eth_chainId` with the expected value before being hardcoded here.
 */
export const robinhoodWagmiChain: Chain = toWagmiChain(robinhoodChain);

/** Robinhood Chain testnet (id 46630). Has a verified USDG deployment. */
export const robinhoodTestnetWagmiChain: Chain = toWagmiChain(robinhoodTestnet);

/**
 * Chain list, in priority order.
 *
 * Robinhood Chain testnet leads, because it is where the protocol is actually
 * deployed and denominated in USDG. Only the Robinhood networks are offered;
 * the app no longer surfaces Arbitrum.
 */
export const appChains = [robinhoodTestnetWagmiChain, robinhoodWagmiChain] as const;

/**
 * The chain the wallet is asked to switch to.
 *
 * Matches `defaultChain` in `@protorwa/shared`, which resolves the same way from
 * `NEXT_PUBLIC_DEFAULT_CHAIN`. Both must agree or the app defaults to one chain
 * while rendering contract addresses for another.
 */
export const defaultAppChain: Chain = robinhoodTestnetWagmiChain;

/** Chain the protocol contracts are deployed on, per `shared/src/contracts`. */
export const protocolChain: Chain = robinhoodTestnetWagmiChain;

const transports = Object.fromEntries(
  appChains.map((chain) => [chain.id, http(chain.rpcUrls.default.http[0])]),
);

const popularWallets = [
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowCoinbaseWallet,
  ...(walletConnectEnabled ? [walletConnectWallet] : []),
];

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: popularWallets,
    },
  ],
  {
    appName: 'ProtoRWA',
    projectId: projectId || 'cabb3e82517691fc521f5fc62f448fd8', // fallback identifier
  },
);

export const wagmiConfig = createConfig({
  chains: appChains,
  transports,
  connectors,
  ssr: true,
});

export { createConfig };
