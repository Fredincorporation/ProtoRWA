'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon } from '@/components/ui/icon';

type Persona = 'investor' | 'founder' | 'arbitrum';

/**
 * Persona / Hackathon Demo Switcher for Arbitrum Open House Buildathon.
 *
 * Allows judges and users to immediately jump into:
 *  - Backer / Investor view (voting on live escrow, trading on secondary market)
 *  - Hardware Founder view (submitting factory evidence, viewing capital release)
 *  - Arbitrum Stylus showcase (WASM HardwareVerifier telemetry attestation)
 */
export function DemoModeSwitcher() {
  const pathname = usePathname();

  return (
    <div className="hidden items-center gap-1 rounded-full border border-outline-variant/40 bg-surface-container-lowest p-0.5 font-mono text-label-sm sm:flex">
      <span className="px-2 py-0.5 text-outline">Demo:</span>
      <Link
        href="/projects/heliofrost-pro/milestones/2/vote"
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
          pathname?.includes('/vote')
            ? 'bg-primary text-on-primary font-bold'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
        }`}
        title="Judge Demo: Milestone Escrow Voting Terminal (Screen 06)"
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
        title="Judge Demo: Founder Milestone Evidence Studio (Screen 27)"
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
        title="Judge Demo: Asset Claim Trading Terminal (Screen 23)"
      >
        <Icon name="candlestick_chart" size={13} />
        Trade Claim
      </Link>
    </div>
  );
}

