/**
 * The alert stream, derived from real project state.
 *
 * The notifications screen used to render a hand-authored `mockNotifications`
 * list under a "Live Ingest Daemon" banner that implied a websocket feed that
 * does not exist. That is the exact dishonesty the project rules forbid. This
 * module replaces it with the truth: every alert is a function of the same
 * `Project[]` the catalogue already reads from the chain (and the showcase
 * fixtures), so the feed reflects actual escrow state rather than copy.
 *
 * Each alert carries a `source` (`live` when it comes from a project whose
 * `liquidityMode` is `real`, otherwise `demo`), so the UI can label the
 * provenance instead of presenting fixtures as events.
 */

import type { NotificationKind, Project } from '@protorwa/shared';

import { isRefundableStatus } from '@/lib/status';

export type AlertSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
export type AlertSource = 'live' | 'demo';

export interface AlertItem {
  id: string;
  kind: NotificationKind;
  severity: AlertSeverity;
  title: string;
  body: string;
  /** When the underlying state was last mutated (ISO 8601). */
  createdAt: string;
  projectSlug: string;
  projectTitle: string;
  href: string;
  actionLabel: string;
  source: AlertSource;
  /** Needs the viewer to act (open vote closing, refund, dispute). */
  actionable: boolean;
}

const DAY_MS = 86_400_000;
const URGENT_WINDOW_MS = 3 * DAY_MS;

function sourceOf(project: Project): AlertSource {
  return project.liquidityMode === 'real' ? 'live' : 'demo';
}

function isClosingSoon(endsAt: string | null, now: number): boolean {
  if (!endsAt) return false;
  const remaining = new Date(endsAt).getTime() - now;
  return remaining > 0 && remaining <= URGENT_WINDOW_MS;
}

function remainingLabel(endsAt: string | null, now: number): string {
  if (!endsAt) return '';
  const remaining = new Date(endsAt).getTime() - now;
  if (remaining <= 0) return 'closed';
  const hours = Math.floor(remaining / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(1, Math.floor(remaining / 60_000))}m left`;
}

/**
 * Build the alert stream for a set of projects, newest first.
 *
 * `now` is injectable for tests. Only states that genuinely exist on a project
 * produce an alert: an open vote, a released tranche, a dispute, or a refundable
 * escrow. Nothing is invented.
 */
export function buildAlerts(projects: Project[], now = Date.now()): AlertItem[] {
  const alerts: AlertItem[] = [];

  for (const p of projects) {
    const source = sourceOf(p);
    const stamp = p.updatedAt || p.createdAt || new Date(now).toISOString();

    p.milestones.forEach((m, i) => {
      if (m.status === 'EVIDENCE') {
        const closing = isClosingSoon(m.votingEndsAt, now);
        alerts.push({
          id: `vote-${p.slug}-${i}`,
          kind: 'VOTING_OPEN',
          severity: closing ? 'WARNING' : 'INFO',
          title: `Vote open: ${m.title}`,
          body: `Evidence for “${m.title}” is in and backer voting is ${
            closing ? `closing soon (${remainingLabel(m.votingEndsAt, now)})` : 'underway'
          } on ${p.title}.`,
          createdAt: stamp,
          projectSlug: p.slug,
          projectTitle: p.title,
          href: `/projects/${p.slug}/milestones/${i}/vote`,
          actionLabel: 'Cast vote',
          source,
          actionable: true,
        });
        return;
      }
      if (m.status === 'DISPUTED') {
        alerts.push({
          id: `dispute-${p.slug}-${i}`,
          kind: 'PROTOCOL_ALERT',
          severity: 'CRITICAL',
          title: `Dispute: ${m.title}`,
          body: `“${m.title}” on ${p.title} was escalated to the oracle${
            m.disputeReason ? `: ${m.disputeReason}` : '.'
          }`,
          createdAt: stamp,
          projectSlug: p.slug,
          projectTitle: p.title,
          href: '/admin',
          actionLabel: 'Review',
          source,
          actionable: true,
        });
        return;
      }
      if (m.status === 'APPROVED') {
        alerts.push({
          id: `release-${p.slug}-${i}`,
          kind: 'TRANCHE_RELEASED',
          severity: 'SUCCESS',
          title: `Tranche released: ${m.title}`,
          body: `Backers approved “${m.title}” on ${p.title}; its escrow tranche has moved to the founder.`,
          createdAt: m.approvedAt ?? stamp,
          projectSlug: p.slug,
          projectTitle: p.title,
          href: `/projects/${p.slug}`,
          actionLabel: 'View build',
          source,
          actionable: false,
        });
      }
    });

    if (isRefundableStatus(p.status)) {
      alerts.push({
        id: `refund-${p.slug}`,
        kind: 'REFUND_AVAILABLE',
        severity: 'WARNING',
        title: `Refund available: ${p.title}`,
        body: `${p.title} was ${
          p.status === 'DEFAULTED' ? 'marked defaulted' : 'cancelled'
        }; claim holders can burn balances for a pro-rata USDG refund.`,
        createdAt: stamp,
        projectSlug: p.slug,
        projectTitle: p.title,
        href: `/projects/${p.slug}`,
        actionLabel: 'Claim refund',
        source,
        actionable: true,
      });
    }
  }

  return alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export type AlertFilter = 'all' | 'action' | 'votes' | 'payouts' | 'disputes';

/** Narrow the stream by the pills on the notifications screen. */
export function filterAlerts(alerts: AlertItem[], filter: AlertFilter): AlertItem[] {
  switch (filter) {
    case 'action':
      return alerts.filter((a) => a.actionable);
    case 'votes':
      return alerts.filter((a) => a.kind === 'VOTING_OPEN');
    case 'payouts':
      return alerts.filter((a) => a.kind === 'TRANCHE_RELEASED' || a.kind === 'REFUND_AVAILABLE');
    case 'disputes':
      return alerts.filter((a) => a.kind === 'PROTOCOL_ALERT');
    case 'all':
    default:
      return alerts;
  }
}

export interface AlertCounts {
  total: number;
  actionable: number;
  byFilter: Record<AlertFilter, number>;
}

export function countAlerts(alerts: AlertItem[]): AlertCounts {
  return {
    total: alerts.length,
    actionable: alerts.filter((a) => a.actionable).length,
    byFilter: {
      all: alerts.length,
      action: alerts.filter((a) => a.actionable).length,
      votes: alerts.filter((a) => a.kind === 'VOTING_OPEN').length,
      payouts: alerts.filter((a) => a.kind === 'TRANCHE_RELEASED' || a.kind === 'REFUND_AVAILABLE').length,
      disputes: alerts.filter((a) => a.kind === 'PROTOCOL_ALERT').length,
    },
  };
}
