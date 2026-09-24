'use client';

import Link from 'next/link';
import { useAccount } from 'wagmi';
import type { Address, Project } from '@protorwa/shared';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { FounderAvatar } from '@/components/founders/founder-post-card';
import {
  deriveFounderDirectory,
  founderDisplayName,
  founderHandle,
  isActivityDeployed,
} from '@/lib/data/founders';
import { useFollowing, useFounderDisplay } from '@/lib/data/useFounderActivity';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { roleMeta } from '@/lib/dashboard';

/** A short, lowercased wallet label like `0x8cc7…a346`. */
function shortWallet(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * The left-rail identity card.
 *
 * A social profile header, personalised per persona: a founder gets their real
 * on-chain handle, follower count and a link to their public page; an investor
 * and an operator get an honest identity built from the wallet and role. Nothing
 * here invents a profile - a founder with no on-chain registration shows the
 * wallet, not a fabricated bio.
 */
export function IdentityCard({ role }: { role: 'investor' | 'founder' | 'admin' }) {
  const { address, isConnected } = useAccount();
  const meta = roleMeta[role];

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-low">
      <div
        aria-hidden
        className="h-14 w-full bg-gradient-to-br from-primary/25 via-secondary/15 to-transparent"
      />
      <div className="-mt-7 flex flex-col gap-2 px-space-md pb-space-md">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-surface-container-low bg-surface-container text-primary shadow-lg">
          <Icon name={meta.icon} size={26} />
        </span>
        <div>
          <div className="font-display text-headline-sm text-on-surface">{meta.label}</div>
          <div className="font-mono text-label-sm text-on-surface-variant">{meta.title}</div>
        </div>
        {isConnected && address ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-label-sm text-primary">
            <StatusDot tone="brand" pulse />
            {shortWallet(address)}
          </span>
        ) : (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-outline-variant/50 px-2 py-0.5 font-mono text-label-sm text-outline">
            <Icon name="account_balance_wallet" size={13} />
            Wallet not connected
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Founder's own social summary (used in the founder left rail when connected).
 *
 * Reads the live `getFounder` profile so the card is the same identity the public
 * page shows. When not yet registered it points at claiming the page rather than
 * dressing up an unregistered wallet as a founder profile.
 */
export function FounderSummaryCard({ address }: { address: Address }) {
  const display = useFounderDisplay(address);
  const handle = founderHandle(address);

  return (
    <div className="flex flex-col gap-space-sm rounded-xl border border-outline-variant/40 bg-surface-container p-space-md">
      <div className="flex items-center gap-2">
        <FounderAvatar name={display.displayName} avatarCid={display.avatarCid} size={40} />
        <div className="min-w-0">
          <div className="truncate font-display text-headline-sm text-on-surface">
            {display.displayName}
          </div>
          <div className="truncate font-mono text-label-sm text-secondary">@{handle}</div>
        </div>
      </div>
      <div className="flex items-center gap-3 font-mono text-label-sm">
        <span className="inline-flex items-center gap-1 text-on-surface-variant">
          <Icon name="groups" size={14} className="text-outline" />
          <span className="tabular text-on-surface">
            {display.followers != null ? formatNumber(display.followers) : '—'}
          </span>
          followers
        </span>
        <Badge tone={display.registered ? 'success' : 'neutral'}>
          {display.registered ? 'on-chain' : 'unregistered'}
        </Badge>
      </div>
      <Link
        href={display.registered ? `/founders/${handle}` : '/studio/updates'}
        className="inline-flex items-center justify-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-label-sm text-primary transition-colors hover:bg-primary/20"
      >
        <Icon name={display.registered ? 'badge' : 'edit_note'} size={14} />
        {display.registered ? 'View public page' : 'Set up your page'}
      </Link>
    </div>
  );
}

/**
 * Followed-founders rail (investor left column).
 *
 * Lists the founders this wallet follows, straight from the on-chain follow
 * graph, each linking to their public page. In the honest demo mode (no
 * FounderActivity) it surfaces showcase founders as "to follow", so the rail is
 * useful and clearly labelled rather than empty.
 */
export function FollowingRail({ projects }: { projects: Project[] }) {
  const { address } = useAccount();
  const deployed = isActivityDeployed();
  const { addresses, loading } = useFollowing(address);

  const directory = deriveFounderDirectory(projects);
  const rows = deployed
    ? addresses.map((a) => ({ address: a, displayName: founderDisplayName(a), handle: founderHandle(a) }))
    : directory.slice(0, 5);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-outline-variant/40 bg-surface-container p-space-md">
      <div className="flex items-center justify-between">
        <h3 className="inline-flex items-center gap-1.5 font-mono text-label-md uppercase tracking-wider text-on-surface">
          <Icon name="hub" size={16} className="text-primary" />
          {deployed ? 'Founders you follow' : 'Suggested founders'}
        </h3>
        <Link
          href="/founders"
          className="font-mono text-label-sm text-primary transition-colors hover:underline"
        >
          Discover
        </Link>
      </div>

      {deployed && loading ? (
        <p className="flex items-center gap-2 font-mono text-label-sm text-outline">
          <Icon name="progress_activity" size={14} className="animate-spin" />
          Loading follows…
        </p>
      ) : rows.length === 0 ? (
        <p className="font-mono text-label-sm text-outline">
          {deployed
            ? 'You follow no one yet. Discover founders to build your feed.'
            : 'No showcase founders yet.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.address}>
              <Link
                href={`/founders/${row.handle}`}
                className="flex items-center gap-2 rounded px-1.5 py-1.5 transition-colors hover:bg-surface-container-high"
              >
                <FounderAvatar name={row.displayName} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-label-md text-on-surface">{row.displayName}</span>
                  <span className="block truncate font-mono text-label-sm text-outline">
                    @{founderHandle(row.address)}
                  </span>
                </span>
                <Icon name="chevron_right" size={16} className="text-outline" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!deployed ? (
        <p className={cn('flex items-start gap-1.5 font-mono text-label-sm text-outline')}>
          <Icon name="info" size={13} className="mt-0.5 shrink-0" />
          <span>Following is a live chain feature. These are showcase founders to explore.</span>
        </p>
      ) : null}
    </div>
  );
}
