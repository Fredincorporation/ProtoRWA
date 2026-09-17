import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { mockNotifications, mockProjects } from '@/lib/data/mock';
import { formatRelativeTime } from '@/lib/format';
import { notificationTone, severityTone } from '@/lib/status';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Protocol alerts, voting windows and escrow events for your projects.',
};

/**
 * Notifications centre (/notifications).
 *
 * Ported from the design's "Notifications Center & Protocol Alert Stream": a
 * severity-coded list with per-project context and deep links.
 *
 * The design presented a live stream. This is the demo set, and an unread count
 * derived from it rather than a hardcoded number, so the badge cannot disagree
 * with the list below it.
 */
export default function NotificationsPage() {
  const unread = mockNotifications.filter((notification) => notification.readAt === null);

  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-space-md">
          <div>
            <div className="mb-1 font-mono text-label-md uppercase tracking-widest text-primary">
              {'//'} Alert Stream
            </div>
            <h1 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
              Notifications
            </h1>
            <p className="mt-2 max-w-2xl text-body-md text-on-surface-variant">
              Voting windows, tranche releases, secondary fills and protocol
              alerts across the projects you hold claims in.
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

      <section className="mx-auto max-w-7xl px-space-lg py-space-lg lg:px-margin">
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
