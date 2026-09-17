'use client';

import * as React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance } from 'wagmi';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { chainLabel } from '@protorwa/shared';
import { cn } from '@/lib/utils';

/**
 * Header wallet control.
 *
 * Mirrors the two states in the design:
 *  - disconnected: emerald "Connect Wallet" CTA, plus the network status chip
 *    and a notifications affordance;
 *  - connected: balance | address chip and a ringed avatar.
 */

/** Network status chip, e.g. "Robinhood Subnet #14 (Gasless Relayer Active)". */
export function NetworkChip({ className }: { className?: string }) {
  const { chainId, isConnected } = useAccount();
  const label = isConnected ? chainLabel(chainId) : 'Not connected';

  return (
    <div
      className={cn(
        'hidden items-center gap-space-xs rounded border-outline-variant/40 ' +
          'bg-surface-container-lowest px-space-sm py-1 lg:flex',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          isConnected ? 'animate-pulse bg-primary' : 'bg-outline',
        )}
      />
      <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
    </div>
  );
}

/** Balance + truncated address, matching the design's connected chip. */
function AccountChip() {
  const { address } = useAccount();
  const { data: balance } = useBalance({ address });

  if (!address) return null;

  const short = `${address.slice(0, 5)}...${address.slice(-4)}`;
  const formatted =
    balance && Number(balance.formatted) > 0
      ? `${Number(balance.formatted).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${balance.symbol}`
      : null;

  return (
    <div className="hidden items-center gap-space-sm rounded border-outline-variant/50 bg-surface-container-low px-space-sm py-1 font-mono text-label-md md:flex">
      {formatted ? (
        <>
          <span className="font-semibold text-primary tabular">{formatted}</span>
          <span className="text-outline-variant">|</span>
        </>
      ) : null}
      <span className="text-on-surface-variant tabular">{short}</span>
    </div>
  );
}

export function NotificationsButton() {
  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative rounded"
      aria-label="Notifications"
    >
      <span role="button" tabIndex={0}>
        <Icon name="notifications" />
      </span>
    </Button>
  );
}

/**
 * Renders RainbowKit's connect flow but styles the *trigger* to match the
 * design system, so the header does not look like a third-party insert.
 */
export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            aria-hidden={!ready}
            className={cn(!ready && 'pointer-events-none opacity-0')}
          >
            {!connected ? (
              <Button size="sm" onClick={openConnectModal} type="button">
                Connect Wallet
              </Button>
            ) : chain.unsupported ? (
              <Button size="sm" variant="danger" onClick={openChainModal} type="button">
                Wrong Network
              </Button>
            ) : (
              <div className="flex items-center gap-space-sm">
                <AccountChip />
                <button
                  type="button"
                  onClick={openAccountModal}
                  aria-label="Account"
                  className="ml-space-xs rounded-full ring-1 ring-primary/40 transition-opacity hover:opacity-80"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container font-mono text-label-sm font-semibold text-on-primary-container">
                    {account.displayName.slice(0, 2).toUpperCase()}
                  </span>
                </button>
              </div>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
