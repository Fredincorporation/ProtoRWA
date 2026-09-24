'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon } from '@/components/ui/icon';

/**
 * Demo network HUD & persona navigation.
 *
 * Directs judges and users to:
 *  - Backer / Investor view (voting on live escrow, trading claims)
 *  - Hardware Founder view (submitting factory evidence)
 *  - Stylus showcase (WASM HardwareVerifier telemetry)
 */
export function DemoModeSwitcher() {
  const pathname = usePathname();

  return (
    <div className="hidden items-center gap-1.5 rounded-full border border-outline-variant/40 bg-surface-container-lowest p-1 font-mono text-label-sm lg:flex">
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
        Commit USDG
      </Link>

      <Link
        href="/projects/heliofrost-pro/milestones/2/vote"
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
          pathname?.includes('/vote')
            ? 'bg-primary text-on-primary font-bold'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
        }`}
        title="Judge: Milestone Escrow Voting Terminal"
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
        title="Judge: Founder Milestone Evidence Studio with Stylus Proofs"
      >
        <Icon name="factory" size={13} />
        Founder Submit
      </Link>

      <Link
        href="/market/p/heliofrost-pro"
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
          pathname?.startsWith('/market/')
            ? 'bg-primary text-on-primary font-bold'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
        }`}
        title="Judge: Asset Claim Trading Terminal"
      >
        <Icon name="candlestick_chart" size={13} />
        Trade Claim
      </Link>
    </div>
  );
}
