'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon } from '@/components/ui/icon';

/**
 * Arbitrum Sepolia Testnet HUD & Persona Navigation.
 *
 * Directs judges and users to:
 *  - Testnet Network Indicator (Arbiscan & Faucet links)
 *  - Backer / Investor view (voting on live escrow, trading claims)
 *  - Hardware Founder view (submitting factory evidence)
 *  - Arbitrum Stylus showcase (WASM HardwareVerifier telemetry)
 */
export function DemoModeSwitcher() {
  const pathname = usePathname();

  return (
    <div className="hidden items-center gap-1.5 rounded-full border border-primary/30 bg-surface-container-lowest py-0.5 pl-2.5 pr-1 font-mono text-label-sm lg:flex">
      <div className="flex items-center gap-1.5 pr-1 text-primary">
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        <span className="font-semibold tracking-wider uppercase text-label-xs">Arb Sepolia</span>
      </div>

      <span className="text-outline">|</span>

      <Link
        href="/projects/heliofrost-pro/invest"
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
          pathname?.includes('/invest')
            ? 'bg-primary text-on-primary font-bold'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
        }`}
        title="Live On-Chain Commit & Claim Token Minting"
      >
        <Icon name="account_balance_wallet" size={13} />
        Commit ETH
      </Link>

      <Link
        href="/projects/heliofrost-pro/milestones/2/vote"
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
          pathname?.includes('/vote')
            ? 'bg-primary text-on-primary font-bold'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
        }`}
        title="Judge: Milestone Escrow Voting Terminal (Screen 06)"
      >
        <Icon name="how_to_vote" size={13} />
        Backer Vote
      </Link>

      <Link
        href="/studio/heliofrost-pro/milestones/2/submit"
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
          pathname?.includes('/submit')
            ? 'bg-primary text-on-primary font-bold'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
        }`}
        title="Judge: Founder Milestone Evidence Studio with Stylus Proofs (Screen 27)"
      >
        <Icon name="factory" size={13} />
        Founder Submit
      </Link>

      <Link
        href="/market/hp"
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
          pathname?.startsWith('/market/')
            ? 'bg-primary text-on-primary font-bold'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
        }`}
        title="Judge: Asset Claim Trading Terminal (Screen 23)"
      >
        <Icon name="candlestick_chart" size={13} />
        Trade Claim
      </Link>
    </div>
  );
}
