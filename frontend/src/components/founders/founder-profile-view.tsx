'use client';

import * as React from 'react';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { ProjectCard } from '@/components/project/project-card';
import { FounderPostCard, FounderAvatar } from '@/components/founders/founder-post-card';
import { FollowButton } from '@/components/founders/follow-button';
import { formatNumber } from '@/lib/format';
import { protocolChain } from '@/lib/wagmi';
import { useAccount } from 'wagmi';
import { defaultChain, type Address, type Project } from '@protorwa/shared';
import {
  demoFeedForProject,
  founderHandle,
  isActivityDeployed,
  type FeedItem,
  type FounderSummary,
} from '@/lib/data/founders';
import { useFounderDisplay, useFounderUpdates } from '@/lib/data/useFounderActivity';

/**
 * Founder profile page body (/founders/[handle]).
 *
 * A social layout — identity header with follow control, a posts column and a
 * projects rail — that runs honest in two modes:
 *   - LIVE: FounderActivity is deployed, so the header counts and the posts come
 *     from the contract + IPFS.
 *   - DEMO: otherwise, the header uses curated showcase metadata and the posts
 *     fall back to the fixture updates for the founder's projects. Every demo
 *     surface is labelled, never presented as live.
 */
export interface FounderProfileViewProps {
  founder: Address;
  summary: FounderSummary;
  projects: Project[];
}

/** Attach catalogue linkage (slug/title) to a live feed item by its project id. */
function decorate(item: FeedItem, projects: Project[]): FeedItem {
  const match = projects.find((p) => p.onChainProjectId === item.projectId || p.id === item.projectId);
  return match
    ? { ...item, projectSlug: match.slug, projectTitle: match.title }
    : item;
}

export function FounderProfileView({ founder, summary, projects }: FounderProfileViewProps) {
  const { address } = useAccount();
  const isSelf = Boolean(address && address.toLowerCase() === founder.toLowerCase());
  const display = useFounderDisplay(founder);
  const live = useFounderUpdates(founder);
  const deployed = isActivityDeployed();

  // Merge live posts (with linkage) and, when there are none, the demo fixtures
  // for this founder's projects. Never show both for the same source.
  const posts = React.useMemo<FeedItem[]>(() => {
    if (live.items.length > 0) {
      return live.items.map((item) => decorate(item, projects));
    }
    const demo = projects.flatMap((p) => demoFeedForProject(p.id));
    return demo.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [live.items, projects]);

  const showDemoChip = !deployed || display.source === 'demo';

  return (
    <div className="mx-auto max-w-6xl px-space-lg py-space-lg lg:px-margin">
      {/* Identity header */}
      <header className="flex flex-col gap-space-md rounded-xl border-outline-variant/40 bg-surface-container p-space-lg">
        <div className="flex flex-col gap-space-md sm:flex-row sm:items-start">
          <FounderAvatar name={display.displayName} avatarCid={display.avatarCid} size={80} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-headline-lg tracking-tight text-on-surface">
                {display.displayName}
              </h1>
              <Badge tone={showDemoChip ? 'neutral' : 'success'}>
                <StatusDot tone={showDemoChip ? 'neutral' : 'brand'} pulse={!showDemoChip} />
                {showDemoChip ? 'demo' : 'verified founder'}
              </Badge>
            </div>
            <p className="mt-0.5 font-mono text-label-md text-secondary">
              @{founderHandle(founder)}
            </p>
            {display.bio ?? summary.bio ? (
              <p className="mt-space-sm max-w-2xl text-body-lg leading-relaxed text-on-surface-variant">
                {display.bio ?? summary.bio}
              </p>
            ) : (
              <p className="mt-space-sm max-w-2xl font-mono text-label-sm text-outline">
                No bio published for this founder yet.
              </p>
            )}

            {/* Stats */}
            <dl className="mt-space-md flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-label-md">
              <div className="flex items-center gap-1.5">
                <dt className="text-outline">Projects</dt>
                <dd className="tabular font-semibold text-on-surface">{projects.length}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="text-outline">Followers</dt>
                <dd className="tabular font-semibold text-on-surface">
                  {display.followers != null ? formatNumber(display.followers) : '—'}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="text-outline">Updates</dt>
                <dd className="tabular font-semibold text-on-surface">{posts.length}</dd>
              </div>
            </dl>

            <div className="mt-space-sm flex flex-wrap items-center gap-2 text-outline">
              <span className="inline-flex items-center gap-1 font-mono text-label-sm">
                <Icon name="verified_user" size={14} /> Founder status is proven by owning a funded
                project on {defaultChain.name}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-start gap-2">
            <FollowButton founder={founder} founderName={display.displayName} isSelf={isSelf} />
          </div>
        </div>

        {showDemoChip ? (
          <p className="flex items-start gap-1.5 rounded-lg border-outline-variant/40 bg-surface-container-low p-space-sm font-mono text-label-sm text-outline">
            <Icon name="info" size={15} className="mt-0.5 shrink-0" />
            <span>
              This is the showcase founder page. Follows and posts are on-chain once
              FounderActivity is deployed to {protocolChain.name}; until then this
              content is demo, labelled as such.
            </span>
          </p>
        ) : null}
      </header>

      {/* Two-column feed + projects */}
      <div className="mt-space-lg grid grid-cols-1 gap-space-lg lg:grid-cols-3">
        <section className="flex flex-col gap-space-md lg:col-span-2">
          <h2 className="font-display text-headline-md uppercase tracking-tight text-on-surface">
            Updates
          </h2>
          {posts.length === 0 ? (
            <p className="rounded-lg border-dashed border-outline-variant/40 bg-surface-container p-space-md text-center font-mono text-label-sm text-outline">
              No updates posted yet.
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

        <aside className="flex flex-col gap-space-md">
          <h2 className="font-display text-headline-md uppercase tracking-tight text-on-surface">
            Projects
          </h2>
          {projects.length === 0 ? (
            <p className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md font-mono text-label-sm text-outline">
              No funded projects.
            </p>
          ) : (
            <div className="flex flex-col gap-space-sm">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
