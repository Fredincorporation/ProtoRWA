'use client';

import * as React from 'react';
import Link from 'next/link';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { mockNotifications, mockProjects } from '@/lib/data/mock';
import { formatRelativeTime } from '@/lib/format';
import { notificationTone, severityTone } from '@/lib/status';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const [filter, setFilter] = React.useState<string>('all');
  const unread = mockNotifications.filter((notification) => notification.readAt === null);

  const filtered = React.useMemo(() => {
    return mockNotifications.filter((notification) => {
      if (filter === 'all') return true;
      if (filter === 'urgent') return notification.kind === 'VOTING_OPEN';
      if (filter === 'votes') return notification.kind === 'VOTING_OPEN';
      if (filter === 'payouts') return notification.kind === 'TRANCHE_RELEASED';
      if (filter === 'updates') return notification.kind === 'FOUNDER_UPDATE';
      return true;
    });
  }, [filter]);

  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-space-md">
          <div>
            <div className="mb-1 flex items-center gap-space-sm">
              <span className="font-mono text-label-sm uppercase tracking-widest text-primary font-semibold px-2 py-0.5 rounded bg-surface-container-high">
                Live Ingest Daemon
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-label-sm text-on-surface-variant">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                Arbitrum Sepolia WebSocket: syncd (#14,892,104)
              </span>
            </div>
            <h1 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
              Notifications &amp; On-Chain Alert Stream
            </h1>
            <p className="mt-1 max-w-2xl text-body-md text-on-surface-variant">
              Real-time alerts for milestone votes, escrow payouts, oracle metrology events, and secondary trade fills across registered physical RWA asset contracts.
            </p>
          </div>

          <div className="flex items-center gap-space-sm rounded bg-surface-container-low px-space-md py-2">
            <StatusDot tone={unread.length > 0 ? 'brand' : 'neutral'} pulse={unread.length > 0} />
            <div className="flex flex-col">
              <span className="font-mono text-label-sm uppercase tracking-wider text-outline">
                Unread
              </span>
              <span className="font-mono text-label-md font-bold text-on-surface">
                {unread.length} of {mockNotifications.length}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-space-lg py-space-lg lg:px-margin flex flex-col gap-space-md">
        {/* Filter Matrix Bar from Screen 02 */}
        <div className="w-full bg-surface-container-low rounded-xl p-space-sm flex flex-wrap items-center justify-between gap-space-sm">
          <div className="flex flex-wrap items-center gap-1">
            {[
              { id: 'all', label: 'All Alerts', count: mockNotifications.length },
              { id: 'urgent', label: 'Action Required', count: 1, dot: true },
              { id: 'votes', label: 'Milestone Votes', count: 1 },
              { id: 'payouts', label: 'Payouts & Yield', count: 1 },
              { id: 'updates', label: 'Founder Updates', count: 1 },
            ].map((pill) => (
              <button
                key={pill.id}
                onClick={() => setFilter(pill.id)}
                className={cn(
                  'px-space-md py-1.5 rounded-lg font-mono text-label-sm font-semibold transition-colors flex items-center gap-2',
                  filter === pill.id
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                )}
              >
                {pill.dot && <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />}
                <span>{pill.label}</span>
                <span className={cn('px-1.5 py-0.2 rounded text-[10px]', filter === pill.id ? 'bg-surface-dim/40' : 'bg-surface-container-highest')}>
                  {pill.count}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 font-mono text-label-sm text-outline">
            <Icon name="rss_feed" size={16} className="text-primary" />
            <span>Relayer Policy: Subsidized</span>
          </div>
        </div>

        {/* Urgent Action Required Banner (Screen 02) */}
        <div className="relative w-full rounded-xl bg-gradient-to-r from-surface-container-highest via-surface-container-high to-surface-container p-space-md lg:p-space-lg shadow-xl overflow-hidden border-l-4 border-tertiary">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
            <div className="flex items-start gap-space-md">
              <div className="w-12 h-12 rounded-xl bg-tertiary/20 flex items-center justify-center shrink-0 text-tertiary">
                <Icon name="how_to_vote" size={28} />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex flex-wrap items-center gap-space-xs font-mono text-label-sm">
                  <span className="px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary font-bold tracking-wider uppercase">
                    Action Mandate
                  </span>
                  <span className="text-on-surface-variant">ESCROW CONTRACT #0x19f2...bD16</span>
                  <span className="text-tertiary flex items-center gap-1 font-semibold">
                    <Icon name="timer" size={14} />
                    Closes in 18h 42m
                  </span>
                </div>
                <h2 className="font-display text-headline-sm text-on-surface font-bold truncate">
                  Milestone 03 Voting Ending Soon: HelioFrost Pro Cold-Storage System
                </h2>
                <p className="font-body-md text-on-surface-variant max-w-2xl">
                  Tranche 03 disbursement (30 ETH) requires backer consensus quorum. SGS Metrology key #0x4f delivered certified dimensional laser inspection pass.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-space-sm shrink-0">
              <Link
                href="/projects/heliofrost-pro"
                className="px-space-md py-2 rounded-lg bg-surface-bright hover:bg-surface-variant text-on-surface font-mono text-label-sm transition-colors"
              >
                Inspect Proofs
              </Link>
              <Link
                href="/projects/heliofrost-pro/milestones/2/vote"
                className="px-space-md py-2 rounded-lg bg-tertiary hover:opacity-90 text-on-tertiary font-mono text-label-sm font-bold uppercase transition-all shadow-md inline-flex items-center gap-1.5"
              >
                <Icon name="verified" size={16} />
                Cast Vote
              </Link>
            </div>
          </div>
        </div>
        {mockNotifications.length === 0 ? (
          <div className="rounded-lg border-dashed border-outline-variant/50 bg-surface-container p-space-xl text-center">
            <Icon name="notifications_off" size={32} className="mx-auto text-outline" />
            <p className="mt-2 font-display text-headline-sm text-on-surface">
              Nothing to report
            </p>
            <p className="mx-auto mt-1 max-w-md text-body-sm text-on-surface-variant">
              Alerts appear here when a project you hold claims in opens a voting
              window or releases a tranche.
            </p>
          </div>
        ) : (
          <ul className="flex-col gap-space-sm">
            {mockNotifications.map((notification) => {
              const project = mockProjects.find(
                (candidate) => candidate.id === notification.projectId,
              );
              const tone = notificationTone[notification.kind];
              const unreadItem = notification.readAt === null;

              return (
                <li
                  key={notification.id}
                  className={
                    unreadItem
                      ? 'flex-col gap-space-sm rounded-lg border-primary/30 bg-surface-container p-space-md sm:flex-row sm:items-start sm:gap-space-md'
                      : 'flex-col gap-space-sm rounded-lg border-outline-variant/40 bg-surface-container p-space-md sm:flex-row sm:items-start sm:gap-space-md'
                  }
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface-container-lowest">
                    <Icon name={tone.icon} size={18} className="text-primary" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <h2 className="font-display text-headline-sm text-on-surface">
                        {notification.title}
                      </h2>
                      <Badge tone={severityTone[notification.severity]}>
                        {notification.severity}
                      </Badge>
                      {unreadItem ? (
                        <span className="inline-flex items-center gap-1 font-mono text-label-sm text-primary">
                          <StatusDot tone="brand" />
                          Unread
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 text-body-sm text-on-surface-variant">
                      {notification.body}
                    </p>

                    <div className="mt-space-sm flex-wrap items-center gap-x-3 gap-y-1 font-mono text-label-sm text-outline">
                      <span>{formatRelativeTime(notification.createdAt)}</span>
                      {project ? (
                        <>
                          <span aria-hidden className="text-outline-variant">
                            ·
                          </span>
                          <Link
                            href={`/projects/${project.slug}`}
                            className="text-secondary transition-colors hover:text-primary"
                          >
                            {project.title}
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {notification.href ? (
                    <Link
                      href={notification.href}
                      className="inline-flex shrink-0 items-center gap-1 self-start rounded border-outline-variant/50 px-space-sm py-1.5 font-mono text-label-sm text-primary transition-colors hover:border-primary hover:bg-primary/10"
                    >
                      Open
                      <Icon name="arrow_forward" size={14} />
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {/* States what the stream is fed by, so the demo set is not mistaken for
            live chain events. */}
        <div className="mt-space-md flex-wrap items-center gap-space-sm rounded border-tertiary/40 bg-tertiary/5 p-space-sm">
          <Icon name="info" size={18} className="shrink-0 text-tertiary" />
          <p className="font-mono text-label-sm text-tertiary">
            Demonstration data. In a live deployment these entries are derived from
            contract events — milestone reviews, tranche releases and market fills
            — not from a server-side feed.
          </p>
        </div>
      </section>
    </>
  );
}
