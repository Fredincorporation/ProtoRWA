'use client';

import * as React from 'react';
import { useAccount } from 'wagmi';
import type { Project } from '@protorwa/shared';

import { Icon } from '@/components/ui/icon';
import { FounderPostCard } from '@/components/founders/founder-post-card';
import { UpdateComposer } from '@/components/founders/update-composer';
import {
  demoFeedForProject,
  isActivityDeployed,
  type FeedItem,
} from '@/lib/data/founders';
import { useFounderUpdates } from '@/lib/data/useFounderActivity';

function link(item: FeedItem, projects: Project[]): FeedItem {
  const match = projects.find(
    (p) => p.onChainProjectId === item.projectId || p.id === item.projectId,
  );
  return match ? { ...item, projectSlug: match.slug, projectTitle: match.title } : item;
}

/**
 * The founder's center-column feed: publish + your posts.
 *
 * A compact counterpart to /studio/updates, sized for the dashboard's center
 * column (no page chrome - the rails carry the surrounding context). Same honest
 * sourcing as the follow feed: live posts when FounderActivity has them, curated
 * showcase posts labelled `demo` otherwise.
 */
export function FounderFeedPanel({ projects }: { projects: Project[] }) {
  const { address, isConnected } = useAccount();
  const deployed = isActivityDeployed();
  const feed = useFounderUpdates(address);

  const owned = React.useMemo(
    () =>
      address
        ? projects.filter((p) => p.founder.toLowerCase() === address.toLowerCase())
        : [],
    [projects, address],
  );

  const posts = React.useMemo<FeedItem[]>(() => {
    if (feed.items.length > 0) return feed.items.map((item) => link(item, projects));
    return owned
      .flatMap((p) => demoFeedForProject(p.id, projects))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [feed.items, owned, projects]);

  if (!isConnected || !address) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-outline-variant/40 bg-surface-container p-space-xl text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-container-high text-outline">
          <Icon name="account_balance_wallet" size={22} />
        </span>
        <p className="max-w-sm text-body-sm text-on-surface-variant">
          Connect the wallet that founded a build to publish updates to your followers.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-secondary/10 text-secondary">
          <Icon name="campaign" size={20} />
        </span>
        <div>
          <h2 className="font-display text-headline-sm text-on-surface">Publish an update</h2>
          <p className="font-mono text-label-sm text-outline">
            {deployed
              ? 'Anchored on-chain as an IPFS CID your followers can verify.'
              : 'Showcase mode — publishing unlocks when FounderActivity goes live.'}
          </p>
        </div>
      </div>

      <UpdateComposer projects={owned} onPosted={feed.refetch} />

      <section className="flex flex-col gap-space-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
            Your updates
          </h3>
          <span className="font-mono text-label-sm text-outline">{posts.length} posted</span>
        </div>
        {posts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-outline-variant/40 bg-surface-container p-space-md text-center font-mono text-label-sm text-outline">
            You haven&rsquo;t posted an update yet.
          </p>
        ) : (
          posts.map((item) => <FounderPostCard key={item.id} item={item} />)
        )}
      </section>
    </div>
  );
}
