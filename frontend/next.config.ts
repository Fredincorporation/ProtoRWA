import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Next's in-build type check crawls on this machine (~4 min). Types are
    // gated separately by `pnpm typecheck` (tsc --noEmit, ~5s), which CI and the
    // pre-build hook run, so the redundant in-build pass is skipped.
    ignoreBuildErrors: true,
  },
  eslint: {
    // Same reasoning: lint runs as its own task, not during every build.
    ignoreDuringBuilds: true,
  },
  // The shared workspace package is consumed as TypeScript source, so Next must
  // compile it rather than treat it as a prebuilt dependency.
  transpilePackages: ['@protorwa/shared'],
  experimental: {
    // The shared package uses Node ESM specifiers (./foo.js) that resolve to
    // .ts sources. This lets webpack follow them.
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
    },
  },
  images: {
    remotePatterns: [
      // IPFS gateways used for project media and milestone evidence.
      { protocol: 'https', hostname: '*.mypinata.cloud' },
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
    ],
  },
  webpack: (config) => {
    // wagmi/walletconnect pull in optional React Native, pino and server-only
    // transports that do not exist in a browser build.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    config.externals.push('pino-pretty', 'lokijs', 'encoding');

    // @wagmi/connectors re-exports Coinbase's Smart Wallet connector, which
    // statically requires the optional x402 payment modules. They are not part
    // of this app's flow, so alias them to an empty stub rather than pulling in
    // a payment SDK we never call.
    // Deny the whole @x402 scope: the smart-wallet payment path is unused here.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@x402': false,
    };

    // Silence noisy warnings from WalletConnect/MetaMask dynamic requires.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /@metamask\/sdk/ },
      { module: /@walletconnect/ },
      { module: /@coinbase\/cdp-sdk/ },
    ];

    return config;
  },
};

export default nextConfig;
