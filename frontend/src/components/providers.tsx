'use client';

import * as React from 'react';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { Toaster } from 'sonner';

import { wagmiConfig } from '@/lib/wagmi';
import { OnboardingProvider } from '@/components/onboarding/onboarding-dialog';

import '@rainbow-me/rainbowkit/styles.css';

/**
 * Client-side provider stack.
 *
 * Order matters: wagmi must wrap RainbowKit, and React Query wraps everything
 * that reads chain state. The theme is pinned to the design tokens so the wallet
 * modal does not look like a third-party insert.
 */

export function Providers({ children }: { children: React.ReactNode }) {
  // A single client per app instance; created lazily so it is not shared across
  // requests during SSR.
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  /**
   * RainbowKitProvider is always mounted: `ConnectButton.Custom` (used by the
   * header) calls RainbowKit hooks and throws "Transaction hooks must be used
   * within RainbowKitProvider" without it. WalletConnect is instead disabled at
   * the wagmi config layer (see lib/wagmi.ts), which is where the failing
   * project-id requests originate.
   */
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          modalSize="compact"
          theme={darkTheme({
            accentColor: '#4edea3',
            accentColorForeground: '#003824',
            borderRadius: 'small',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
        >
          <OnboardingProvider>
            {children}
          </OnboardingProvider>
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#1b2028',
                border: '1px solid rgba(134, 148, 138, 0.5)',
                color: '#dee2ee',
              },
            }}
          />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
