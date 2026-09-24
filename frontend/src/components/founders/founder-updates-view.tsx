'use client';

import * as React from 'react';
import { useAccount } from 'wagmi';

import { Icon } from '@/components/ui/icon';
import { FounderPostCard } from '@/components/founders/founder-post-card';
import { UpdateComposer } from '@/components/founders/update-composer';
import type { Project } from '@protorwa/shared';
import {
  demoFeedForProject,
  isActivityDeployed,
  type FeedItem,
} from '@/lib/data/founders';
import { useFounderUpdates } from '@/lib/data/useFounderActivity';

/** Attach catalogue linkage (slug/title) to a live post by its project id. */
function link(item: FeedItem, projects: Project[]): FeedItem {
  const match = projects.find((p) => p.onChainProjectId === item.projectId || p.id === item.projectId);
  return match ? { ...item, projectSlug: match.slug, projectTitle: match.title } : item;
}

/**
 * Founder "your updates" console.
 *
 * The composer plus the founder's own published timeline. Used on
 * /studio/updates and embedded in the founder dashboard. When FounderActivity is
 * not deployed the composer is honestly disabled and the timeline falls back to
 * the showcase fixtures for the projects this wallet owns (labelled demo).
 */
export function FounderUpdatesView({ projects }: { projects: Project[] }) {
  const { address } = useAccount();
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

  if (!address) {
    return (
      <div className="mx-auto max-w-3xl px-space-lg py-space-xl text-center lg:px-margin">
        <Icon name="account_balance_wallet" size={28} className="mx-auto text-outline" />
        <p className="mt-2 font-display text-headline-sm text-on-surface">Connect your founder wallet</p>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Sign in with the wallet that owns a project to publish updates to your followers.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-space-lg px-space-lg py-space-lg lg:grid-cols-3 lg:px-margin">
      <div className="flex flex-col gap-space-md lg:col-span-2">
        <UpdateComposer projects={owned} onPosted={feed.refetch} />

        <section className="flex flex-col gap-space-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-headline-md uppercase tracking-tight text-on-surface">
              Your updates
            </h2>
            <span className="font-mono text-label-sm text-outline">{posts.length} posted</span>
          </div>
          {posts.length === 0 ? (
            <p className="rounded-lg border-dashed border-outline-variant/40 bg-surface-container p-space-md text-center font-mono text-label-sm text-outline">
              You haven&rsquo;t posted an update yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-space-sm">
              {posts.map((item) => (
                <li key={item.id}>
                  <FounderPostCard item={item} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-space-md">
        <div className="rounded-xl border-outline-variant/40 bg-surface-container p-space-md">
          <h3 className="mb-1 font-mono text-label-md uppercase tracking-wider text-on-surface">
            Your projects
          </h3>
          {owned.length === 0 ? (
            <p className="font-mono text-label-sm text-outline">
              This wallet doesn&rsquo;t own any projects on this network.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {owned.map((p) => (
                <li key={p.id} className="flex items-center gap-2 font-mono text-label-sm text-on-surface-variant">
                  <Icon name="deployed_code" size={14} className="text-secondary" />
                  {p.title}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="flex items-start gap-1.5 rounded-lg border-outline-variant/40 bg-surface-container-low p-space-sm font-mono text-label-sm text-outline">
          <Icon name="info" size={15} className="mt-0.5 shrink-0" />
          <span>
            {deployed
              ? 'Updates are anchored on-chain as an IPFS CID you can independently verify. Only your followers see them in their feed.'
              : 'Publishing unlocks when FounderActivity is deployed. The timeline below shows curated demo posts for your projects.'}
          </span>
        </p>
      </aside>
    </div>
  );
}
