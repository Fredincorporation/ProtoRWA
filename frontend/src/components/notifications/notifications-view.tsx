'use client';

import * as React from 'react';
import Link from 'next/link';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { formatDate, formatRelativeTime } from '@/lib/format';
import {
  countAlerts,
  filterAlerts,
  type AlertFilter,
  type AlertItem,
} from '@/lib/notifications';
import { notificationTone, severityTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { defaultChain } from '@protorwa/shared';

/**
 * The alert stream.
 *
 * Every row here is derived from real escrow state by `buildAlerts` on the
 * server; this component only renders and lets the viewer filter, search and
 * dismiss. Read state is per-browser (localStorage) because there is no account
 * or notification backend to persist it against - which the screen says plainly
 * rather than implying a delivered inbox.
 */

const READ_KEY = 'protorwa_read_alerts';

const FILTERS: Array<{ id: AlertFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'action', label: 'Needs action' },
  { id: 'votes', label: 'Milestone votes' },
  { id: 'payouts', label: 'Payouts & refunds' },
  { id: 'disputes', label: 'Disputes' },
];

export function NotificationsView({ alerts }: { alerts: AlertItem[] }) {
  const [filter, setFilter] = React.useState<AlertFilter>('all');
  const [query, setQuery] = React.useState('');
  const [read, setRead] = React.useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = React.useState(false);

  // Restore dismissal state after mount so the set is not SSR-hydrated wrong.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(READ_KEY);
      if (raw) setRead(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore malformed storage */
    }
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(READ_KEY, JSON.stringify([...read]));
    } catch {
      /* storage full or blocked - non-fatal */
    }
  }, [read, hydrated]);

  const counts = React.useMemo(() => countAlerts(alerts), [alerts]);
  const unreadCount = React.useMemo(
    () => alerts.filter((a) => !read.has(a.id)).length,
    [alerts, read],
  );

  const visible = React.useMemo(() => {
    let list = filterAlerts(alerts, filter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.body.toLowerCase().includes(q) ||
          a.projectTitle.toLowerCase().includes(q),
      );
    }
    return list;
  }, [alerts, filter, query]);

  const groups = React.useMemo(() => groupByDay(visible), [visible]);

  const markRead = (id: string) =>
    setRead((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  const markAllVisibleRead = () =>
    setRead((prev) => {
      const next = new Set(prev);
      for (const a of visible) next.add(a.id);
      return next;
    });

  return (
    <>
      {/* Header - honest about what the stream is and where it comes from. */}
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-space-md">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-label-sm font-semibold uppercase tracking-widest text-primary">
                Escrow event stream
              </span>
              <span className="font-mono text-label-sm text-on-surface-variant">
                {defaultChain.name} · chain {defaultChain.id}
              </span>
            </div>
            <h1 className="font-display text-headline-lg tracking-tight text-on-surface">
              Notifications
            </h1>
            <p className="mt-1 max-w-2xl text-body-md text-on-surface-variant">
              Milestone votes, tranche releases, disputes and refunds - derived
              live from the projects registry and escrow, not a separate feed.
            </p>
          </div>

          <div className="flex items-center gap-space-sm rounded-lg border-outline-variant/40 bg-surface-container-low px-space-md py-2">
            <StatusDot tone={unreadCount > 0 ? 'brand' : 'neutral'} pulse={unreadCount > 0} />
            <div className="flex flex-col">
              <span className="font-mono text-label-sm uppercase tracking-wider text-outline">Unread</span>
              <span className="font-mono text-label-md font-bold text-on-surface">
                {unreadCount} / {counts.total}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto flex max-w-6xl flex-col gap-space-md px-space-lg py-space-lg lg:px-margin">
        {/* Needs-action banner, derived from the actionable count. */}
        {counts.actionable > 0 ? (
          <div className="flex flex-col gap-space-sm rounded-xl border-l-4 border-tertiary bg-surface-container-high p-space-md sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-space-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tertiary/15 text-tertiary">
                <Icon name="priority_high" size={22} />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-headline-sm text-on-surface">
                  {counts.actionable} alert{counts.actionable === 1 ? '' : 's'} need your attention
                </h2>
                <p className="text-body-sm text-on-surface-variant">
                  Open votes, disputes and refunds across builds you can act on.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setFilter('action')}
                className="rounded-lg bg-tertiary px-space-md py-2 font-mono text-label-sm font-semibold uppercase text-on-tertiary transition-opacity hover:opacity-90"
              >
                Show actionable
              </button>
            </div>
          </div>
        ) : null}

        {/* Filter matrix with live counts, plus search and mark-all control. */}
        <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-low p-space-sm">
          <div className="flex flex-wrap items-center gap-1">
            {FILTERS.map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setFilter(pill.id)}
                aria-pressed={filter === pill.id}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-space-md py-1.5 font-mono text-label-sm font-semibold transition-colors',
                  filter === pill.id
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
                )}
              >
                <span>{pill.label}</span>
                <span
                  className={cn(
                    'rounded px-1.5 text-[10px]',
                    filter === pill.id ? 'bg-surface-dim/40' : 'bg-surface-container-highest',
                  )}
                >
                  {counts.byFilter[pill.id]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-lg bg-surface-container-lowest px-space-sm py-1.5">
              <Icon name="search" size={16} className="shrink-0 text-outline" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search alerts, projects…"
                aria-label="Search alerts"
                className="w-full bg-transparent font-body-sm text-on-surface outline-none placeholder:text-outline"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="text-outline hover:text-on-surface"
                >
                  <Icon name="close" size={14} />
                </button>
              ) : null}
            </label>
            <button
              type="button"
              onClick={markAllVisibleRead}
              disabled={visible.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg px-space-md py-1.5 font-mono text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-40"
            >
              <Icon name="done_all" size={16} />
              Mark visible read
            </button>
          </div>
        </div>

        {/* Stream */}
        {visible.length === 0 ? (
          <EmptyState filter={filter} query={query} />
        ) : (
          groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <h2 className="font-mono text-label-sm uppercase tracking-widest text-outline">
                {group.label}
              </h2>
              <ul className="flex flex-col gap-2">
                {group.items.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    unread={!read.has(alert.id)}
                    onRead={() => markRead(alert.id)}
                  />
                ))}
              </ul>
            </div>
          ))
        )}

        <p className="mt-2 flex items-start gap-1.5 rounded-lg border-outline-variant/40 bg-surface-container-low p-space-sm font-mono text-label-sm text-outline">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          <span>
            Alerts are computed from contract state on each load; rows tagged
            &lsquo;demo&rsquo; come from the showcase catalogue, not the chain. Read
            marks are kept in this browser only.
          </span>
        </p>
      </section>
    </>
  );
}

function AlertRow({
  alert,
  unread,
  onRead,
}: {
  alert: AlertItem;
  unread: boolean;
  onRead: () => void;
}) {
  const tone = notificationTone[alert.kind];
  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-space-md transition-colors sm:flex-row sm:items-start',
        unread
          ? 'border-primary/30 bg-surface-container'
          : 'border-outline-variant/40 bg-surface-container-lowest opacity-80',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container">
        <Icon name={tone.icon} size={18} className="text-primary" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-headline-sm text-on-surface">{alert.title}</h3>
          <Badge tone={severityTone[alert.severity]}>{alert.severity}</Badge>
          <Badge tone={alert.source === 'live' ? 'success' : 'neutral'}>
            <StatusDot tone={alert.source === 'live' ? 'brand' : 'neutral'} />
            {alert.source}
          </Badge>
          {unread ? (
            <span className="inline-flex items-center gap-1 font-mono text-label-sm text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              New
            </span>
          ) : null}
        </div>

        <p className="mt-1 text-body-sm text-on-surface-variant">{alert.body}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-label-sm text-outline">
          <span title={formatDate(alert.createdAt)}>{formatRelativeTime(alert.createdAt)}</span>
          <span aria-hidden>·</span>
          <Link
            href={`/projects/${alert.projectSlug}`}
            className="text-secondary transition-colors hover:text-primary"
          >
            {alert.projectTitle}
          </Link>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 self-start">
        <Link
          href={alert.href}
          onClick={onRead}
          className={cn(
            'inline-flex items-center gap-1 rounded px-space-sm py-1.5 font-mono text-label-sm font-semibold transition-colors',
            alert.actionable
              ? 'bg-primary/15 text-primary hover:bg-primary/25'
              : 'border-outline-variant/50 text-on-surface-variant hover:border-primary hover:text-primary',
          )}
        >
          {alert.actionLabel}
          <Icon name="arrow_forward" size={14} />
        </Link>
        {unread ? (
          <button
            type="button"
            onClick={onRead}
            aria-label="Mark as read"
            className="rounded p-1.5 text-outline transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <Icon name="check" size={16} />
          </button>
        ) : null}
      </div>
    </li>
  );
}

function EmptyState({ filter, query }: { filter: AlertFilter; query: string }) {
  const reason = query
    ? `No alerts match “${query}”.`
    : filter === 'all'
      ? 'No alerts yet.'
      : 'Nothing in this category right now.';
  return (
    <div className="rounded-lg border border-dashed border-outline-variant/50 bg-surface-container p-space-xl text-center">
      <Icon name="notifications_off" size={32} className="mx-auto text-outline" />
      <p className="mt-2 font-display text-headline-sm text-on-surface">You&rsquo;re all caught up</p>
      <p className="mx-auto mt-1 max-w-md text-body-sm text-on-surface-variant">
        {reason} Alerts appear when a build opens a vote, releases a tranche, is
        disputed or becomes refundable.
      </p>
    </div>
  );
}

interface DayGroup {
  label: string;
  items: AlertItem[];
}

function groupByDay(alerts: AlertItem[], now = new Date()): DayGroup[] {
  const groups: DayGroup[] = [];
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);

  for (const alert of alerts) {
    const when = new Date(alert.createdAt);
    const diffDays = Math.round((today - startOfDay(when)) / 86_400_000);
    const label =
      diffDays <= 0
        ? 'Today'
        : diffDays === 1
          ? 'Yesterday'
          : formatDate(alert.createdAt, { month: 'short', day: 'numeric', year: 'numeric' });
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(alert);
    else groups.push({ label, items: [alert] });
  }
  return groups;
}
