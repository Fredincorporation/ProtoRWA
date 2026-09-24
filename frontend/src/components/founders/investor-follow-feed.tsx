'use client';

import Link from 'next/link';
import { useAccount } from 'wagmi';
import type { Project } from '@protorwa/shared';

import { FounderPostCard } from '@/components/founders/founder-post-card';
import { Icon } from '@/components/ui/icon';
import { useFollowFeed } from '@/lib/data/useFounderActivity';
import { isActivityDeployed } from '@/lib/data/founders';

/**
 * The investor follow feed (dashboard center column).
 *
 * A social timeline of updates from founders the connected wallet follows,
 * sourced live from FounderActivity. Its states are all honest:
 *  - Not deployed        -> the curated showcase timeline, labelled `demo`.
 *  - Deployed, no wallet -> a connect prompt (nothing to personalise against).
 *  - Following nobody    -> a discovery prompt, not fabricated posts.
 *  - Following, no posts -> an empty state, not stale fixtures.
 */
export function InvestorFollowFeed({ projects }: { projects: Project[] }) {
  const { address, isConnected } = useAccount();
  const deployed = isActivityDeployed();
  const { items, loading, followingCount } = useFollowFeed(address, projects);

  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon name="dynamic_feed" size={20} />
          </span>
          <div>
            <h2 className="font-display text-headline-sm text-on-surface">Your feed</h2>
            <p className="font-mono text-label-sm text-outline">
              {deployed
                ? `Updates from ${followingCount} founder${followingCount === 1 ? '' : 's'} you follow`
                : 'Showcase preview — follows launch on-chain'}
            </p>
          </div>
        </div>
        <Link
          href="/founders"
          className="inline-flex items-center gap-1.5 rounded border border-outline-variant/50 px-3 py-1.5 font-mono text-label-sm text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
        >
          <Icon name="explore" size={14} />
          Discover founders
        </Link>
      </div>

      {!deployed ? (
        <p className="flex items-start gap-1.5 rounded-lg border border-dashed border-outline-variant/40 bg-surface-container-lowest px-space-md py-2 font-mono text-label-sm text-outline">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
          <span>
            Founder follows are a live chain feature. Until FounderActivity is deployed, this
            timeline shows curated showcase updates (labelled demo) so you can see the layout.
          </span>
        </p>
      ) : null}

      {deployed && !isConnected ? (
        <EmptyPanel
          icon="account_balance_wallet"
          text="Connect a wallet to follow founders and build a personal feed."
        />
      ) : null}

      {deployed && isConnected && followingCount === 0 ? (
        <EmptyPanel
          icon="person_search"
          text="You're not following any founders yet. Follow one to get their build updates here."
          cta={{ href: '/founders', label: 'Find founders' }}
        />
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 font-mono text-label-sm text-outline">
          <Icon name="progress_activity" size={16} className="animate-spin" />
          Loading updates…
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="flex flex-col gap-space-sm">
          {items.map((item) => (
            <FounderPostCard key={item.id} item={item} />
          ))}
        </div>
      ) : null}

      {!loading && deployed && isConnected && followingCount > 0 && items.length === 0 ? (
        <EmptyPanel
          icon="hourglass_empty"
          text="No updates yet from the founders you follow. They post build progress as their escrow milestones move."
        />
      ) : null}
    </div>
  );
}

function EmptyPanel({
  icon,
  text,
  cta,
}: {
  icon: string;
  text: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-outline-variant/40 bg-surface-container p-space-xl text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-container-high text-outline">
        <Icon name={icon} size={22} />
      </span>
      <p className="max-w-sm text-body-sm text-on-surface-variant">{text}</p>
      {cta ? (
        <Link
          href={cta.href}
          className="mt-1 inline-flex items-center gap-1.5 rounded bg-primary px-4 py-2 font-mono text-label-sm text-on-primary transition-colors hover:bg-primary-fixed"
        >
          {cta.label}
          <Icon name="arrow_forward" size={14} />
        </Link>
      ) : null}
    </div>
  );
}
