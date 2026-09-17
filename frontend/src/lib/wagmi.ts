/**
 * wagmi / chain configuration.
 *
 * Chain ids and RPC URLs come from the shared package (env-driven) so the app
 * targets Robinhood Chain when configured and falls back to Arbitrum Sepolia.
 */

import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  coinbaseWallet as rainbowCoinbaseWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { arbitrumSepolia } from 'wagmi/chains';
import { http, createConfig } from 'wagmi';
import type { Chain } from 'viem';

import { robinhoodChain } from '@protorwa/shared';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '';
export const walletConnectEnabled = projectId.length > 0;

export const robinhoodWagmiChain: Chain | null =
  robinhoodChain.id !== 0 && robinhoodChain.rpcUrl
    ? {
        id: robinhoodChain.id,
        name: robinhoodChain.name,
        nativeCurrency: robinhoodChain.nativeCurrency,
        rpcUrls: {
          default: { http: [robinhoodChain.rpcUrl] },
          public: { http: [robinhoodChain.rpcUrl] },
        },
        blockExplorers: robinhoodChain.blockExplorerUrl
          ? {
              default: {
                name: `${robinhoodChain.name} Explorer`,
                url: robinhoodChain.blockExplorerUrl,
              },
            }
          : undefined,
        testnet: robinhoodChain.testnet,
      }
    : null;

export const appChains = robinhoodWagmiChain
  ? ([robinhoodWagmiChain, arbitrumSepolia] as const)
  : ([arbitrumSepolia] as const);

export const defaultAppChain: Chain = appChains[0];

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
