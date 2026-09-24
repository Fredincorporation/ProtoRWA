/**
 * Per-role mission-control queues.
 *
 * The three role dashboards (Investor, Founder, Admin) are thin views over a
 * single idea: "given the protocol's projects and, where relevant, the connected
 * address, what can this persona act on right now?" That derivation lives here as
 * pure functions over `Project[]` so it is unit-testable in isolation and shared by
 * every dashboard - the dashboards themselves only render the result.
 *
 * Honesty rule (project-wide): a queue item's `source` is `live` only when the
 * underlying project's `liquidityMode` is `real` (a genuine on-chain record from
 * the catalogue's chain reader). Everything seeded from the showcase fixtures is
 * labelled `demo`, so the dashboard never presents synthetic state as live. We do
 * not fabricate wallet ownership: `mine` is set only where it is actually
 * derivable (a founder address match); investment/vote rows describe actions
 * available across the protocol, not a claimed holding.
 */

import type { Project } from '@protorwa/shared';

import { isRefundableStatus, isTradableStatus } from '@/lib/status';

export type DashboardRole = 'investor' | 'founder' | 'admin';

export const DASHBOARD_ROLES: readonly DashboardRole[] = ['investor', 'founder', 'admin'];

export function isDashboardRole(value: string): value is DashboardRole {
  return (DASHBOARD_ROLES as readonly string[]).includes(value);
}

export function dashboardPathFor(role: DashboardRole): string {
  return `/dashboard/${role}`;
}

export type QueueKind =
  | 'invest'
  | 'vote'
  | 'trade'
  | 'refund'
  | 'submit-evidence'
  | 'funding'
  | 'launch'
  | 'review';

export type QueueSource = 'live' | 'demo';

export interface QueueItem {
  /** Stable React key. */
  key: string;
  kind: QueueKind;
  /** The project this row belongs to. */
  projectSlug: string;
  /** Milestone this row targets, when it is milestone-scoped (vote / evidence). */
  milestoneIndex?: number;
  title: string;
  detail: string;
  /** Deep link into the already-wired action UI for this row. */
  href: string;
  source: QueueSource;
  /** True when the row is tied to the connected address (founder ownership). */
  mine: boolean;
  /** Time-critical (voting closing, refund pending) - sorts first. */
  urgent: boolean;
  /**
   * Which self-contained client component to embed inline on the dashboard
   * instead of only linking out. Only `ClaimRefundPanel` is compact enough to
   * render in a panel; every other action keeps its dedicated page.
   */
  inline?: 'refund';
}

export interface QueueSection {
  id: string;
  label: string;
  description: string;
  icon: string;
  items: QueueItem[];
}

export interface RoleMeta {
  label: string;
  title: string;
  tagline: string;
  icon: string;
}

export const roleMeta: Record<DashboardRole, RoleMeta> = {
  investor: {
    label: 'Investor',
    title: 'Investor Control',
    tagline: 'Fund builds, vote on tranches, trade claims, and reclaim escrow - in one place.',
    icon: 'account_balance_wallet',
  },
  founder: {
    label: 'Founder',
    title: 'Founder Control',
    tagline: 'Your raises, milestone evidence deadlines, and escrow status at a glance.',
    icon: 'precision_manufacturing',
  },
  admin: {
    label: 'Admin',
    title: 'Protocol Oversight',
    tagline: 'Reviews awaiting the oracle, disputes, and refundable escrows across every build.',
    icon: 'shield',
  },
};

function sourceOf(project: Project): QueueSource {
  return project.liquidityMode === 'real' ? 'live' : 'demo';
}

function sameAddress(a: string | undefined, b: string | undefined): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

/**
 * Which projects the wallet has actually participated in.
 *
 * A project counts as participated when the wallet holds claim units in it:
 *   - a `real` project is decided by its on-chain ClaimToken balance (from
 *     `useWalletHoldings`), the genuinely live pipeline;
 *   - a `demo` project is decided by the showcase's seeded positions, so the
 *     offline demo still shows a holdings-filtered market.
 *
 * Returns the set of `Project.id` values. When the caller has no holdings signal
 * at all (empty maps, not connected) it returns an empty set, which the investor
 * queue reads as "nothing participated in yet" rather than "show everything".
 */
export function participatedProjectIds(
  projects: Project[],
  liveBalances: Map<string, bigint>,
  demoHeldIds: Set<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const project of projects) {
    if (project.liquidityMode === 'real') {
      const balance = project.onChainProjectId
        ? liveBalances.get(project.onChainProjectId)
        : undefined;
      if (balance && balance > 0n) ids.add(project.id);
    } else if (demoHeldIds.has(project.id)) {
      ids.add(project.id);
    }
  }
  return ids;
}

const DAY_MS = 86_400_000;

/** Voting window closing within this many days counts as urgent. */
const URGENT_WINDOW_MS = 3 * DAY_MS;

function isVotingUrgent(endsAt: string | null, now: number): boolean {
  if (!endsAt) return false;
  const remaining = new Date(endsAt).getTime() - now;
  return remaining > 0 && remaining <= URGENT_WINDOW_MS;
}

/** Investor: anything a backer can do now across the protocol. */
export function buildInvestorQueue(
  projects: Project[],
  now = Date.now(),
  heldIds?: Set<string>,
): QueueSection[] {
  const invest: QueueItem[] = [];
  const vote: QueueItem[] = [];
  const trade: QueueItem[] = [];
  const refund: QueueItem[] = [];

  for (const p of projects) {
    const source = sourceOf(p);

    if (p.status === 'FUNDING') {
      invest.push({
        key: `invest-${p.slug}`,
        kind: 'invest',
        projectSlug: p.slug,
        title: p.title,
        detail: `Open round · ${p.claimsCommitted}/${p.totalClaims} claims committed`,
        href: `/projects/${p.slug}/invest`,
        source,
        mine: false,
        urgent: false,
      });
    }

    if (isTradableStatus(p.status)) {
      // When a holdings signal is supplied, the market tab shows only projects the
      // wallet actually holds claims in - "exit a position", not "browse a shelf".
      const participated = !heldIds || heldIds.has(p.id);
      if (participated) {
        trade.push({
          key: `trade-${p.slug}`,
          kind: 'trade',
          projectSlug: p.slug,
          title: p.title,
          detail: `Claims tradeable on the ${source === 'live' ? 'live' : 'demo'} USDG book`,
          href: `/market/p/${p.slug}`,
          source,
          mine: heldIds ? heldIds.has(p.id) : false,
          urgent: false,
        });
      }
    }

    if (isRefundableStatus(p.status)) {
      refund.push({
        key: `refund-${p.slug}`,
        kind: 'refund',
        projectSlug: p.slug,
        title: p.title,
        detail:
          p.status === 'DEFAULTED'
            ? 'Escrow defaulting - claim holders can burn balances for a pro-rata refund.'
            : 'Raise cancelled - claim holders can burn balances for a pro-rata refund.',
        href: `/projects/${p.slug}`,
        source,
        mine: false,
        urgent: true,
        inline: 'refund',
      });
    }

    p.milestones.forEach((m, i) => {
      if (m.status !== 'EVIDENCE') return;
      vote.push({
        key: `vote-${p.slug}-${i}`,
        kind: 'vote',
        projectSlug: p.slug,
        milestoneIndex: i,
        title: `${p.title} · ${m.title}`,
        detail: 'Evidence submitted - the backer vote window is open.',
        href: `/projects/${p.slug}/milestones/${i}/vote`,
        source,
        mine: false,
        urgent: isVotingUrgent(m.votingEndsAt, now),
      });
    });
  }

  const sortUrgent = (items: QueueItem[]) =>
    [...items].sort((a, b) => Number(b.urgent) - Number(a.urgent));

  return [
    {
      id: 'votes',
      label: 'Milestones awaiting your vote',
      description: 'Tranches whose evidence is in and the review window is open.',
      icon: 'how_to_vote',
      items: sortUrgent(vote),
    },
    {
      id: 'refunds',
      label: 'Refunds you can claim',
      description: 'Escrow on cancelled or defaulted builds, claimable by holders.',
      icon: 'currency_exchange',
      items: refund,
    },
    {
      id: 'invest',
      label: 'Open funding rounds',
      description: 'Projects accepting commitments now.',
      icon: 'payments',
      items: sortUrgent(invest),
    },
    {
      id: 'trade',
      label: heldIds ? 'Your claims on the market' : 'Secondary market',
      description: heldIds
        ? 'Positions you hold in builds past funding - exit before delivery or add to a holding.'
        : 'In-production and delivered builds whose claims can change hands.',
      icon: 'swap_horiz',
      items: sortUrgent(trade),
    },
  ];
}

/** Founder: a connected wallet's own projects - evidence deadlines and raises. */
export function buildFounderQueue(
  projects: Project[],
  address: string | undefined,
  now = Date.now(),
): QueueSection[] {
  const mine = address ? projects.filter((p) => sameAddress(p.founder, address)) : [];
  const submit: QueueItem[] = [];
  const funding: QueueItem[] = [];

  for (const p of mine) {
    const source = sourceOf(p);

    if (p.status === 'FUNDING' || p.status === 'DRAFT') {
      funding.push({
        key: `funding-${p.slug}`,
        kind: 'funding',
        projectSlug: p.slug,
        title: p.title,
        detail:
          p.status === 'DRAFT'
            ? 'Draft - open the funding round to start receiving commitments.'
            : `Raising · ${p.claimsCommitted}/${p.totalClaims} claims committed`,
        href: `/projects/${p.slug}`,
        source,
        mine: true,
        urgent: false,
      });
    }

    p.milestones.forEach((m, i) => {
      if (m.status !== 'PENDING' && m.status !== 'REJECTED') return;
      submit.push({
        key: `evidence-${p.slug}-${i}`,
        kind: 'submit-evidence',
        projectSlug: p.slug,
        milestoneIndex: i,
        title: `${p.title} · ${m.title}`,
        detail:
          m.status === 'REJECTED'
            ? 'Voted down - gather more evidence and resubmit.'
            : 'Due for evidence submission to open the backer vote.',
        href: `/studio/${p.slug}/milestones/${i}/submit`,
        source,
        mine: true,
        urgent: new Date(m.dueAt).getTime() <= now,
      });
    });
  }

  const launch: QueueItem[] = [
    {
      key: 'launch',
      kind: 'launch',
      projectSlug: '',
      title: 'Launch a hardware build',
      detail: 'Create a project, set milestone tranches, and open a funding round.',
      href: '/studio/new',
      source: 'live',
      mine: true,
      urgent: false,
    },
  ];

  return [
    {
      id: 'evidence',
      label: 'Evidence to submit',
      description: 'Your milestones awaiting factory/BOM evidence.',
      icon: 'fact_check',
      items: submit,
    },
    {
      id: 'raises',
      label: 'Your active raises',
      description: 'Projects you founded that are drafting or collecting capital.',
      icon: 'rocket_launch',
      items: funding,
    },
    {
      id: 'new',
      label: 'Start something',
      description: 'Tokenize a new build.',
      icon: 'add',
      items: launch,
    },
  ];
}

/** Admin: protocol-wide oversight. Privileged writes live on /admin behind the operator gate. */
export function buildAdminQueue(projects: Project[], now = Date.now()): QueueSection[] {
  const disputes: QueueItem[] = [];
  const reviews: QueueItem[] = [];
  const refunds: QueueItem[] = [];

  for (const p of projects) {
    const source = sourceOf(p);

    p.milestones.forEach((m, i) => {
      if (m.status === 'DISPUTED') {
        disputes.push({
          key: `dispute-${p.slug}-${i}`,
          kind: 'review',
          projectSlug: p.slug,
          milestoneIndex: i,
          title: `${p.title} · ${m.title}`,
          detail: m.disputeReason
            ? `Escalated: ${m.disputeReason}`
            : 'Escalated to the oracle for resolution.',
          href: '/admin',
          source,
          mine: true,
          urgent: true,
        });
        return;
      }
      if (m.status === 'EVIDENCE') {
        reviews.push({
          key: `review-${p.slug}-${i}`,
          kind: 'review',
          projectSlug: p.slug,
          milestoneIndex: i,
          title: `${p.title} · ${m.title}`,
          detail: isVotingUrgent(m.votingEndsAt, now)
            ? 'Vote window closing - resolve if quorum has settled.'
            : 'Evidence submitted, review window open.',
          href: '/admin',
          source,
          mine: true,
          urgent: isVotingUrgent(m.votingEndsAt, now),
        });
      }
    });

    if (p.status === 'IN_PRODUCTION' || p.status === 'FUNDING') {
      // Only reachable from an admin's status control (e.g. setting CANCELLED to
      // enable refunds). Surfaced, not actionable inline.
      refunds.push({
        key: `status-${p.slug}`,
        kind: 'review',
        projectSlug: p.slug,
        title: p.title,
        detail: `Status ${p.status.replace('_', ' ').toLowerCase()} - admin can transition it (e.g. cancel to open refunds).`,
        href: '/admin',
        source,
        mine: true,
        urgent: false,
      });
    }
  }

  return [
    {
      id: 'disputes',
      label: 'Open disputes',
      description: 'Milestones escalated to the oracle.',
      icon: 'gavel',
      items: disputes,
    },
    {
      id: 'reviews',
      label: 'Reviews pending resolution',
      description: 'Voting windows the oracle may need to settle.',
      icon: 'rule_folder',
      items: reviews,
    },
    {
      id: 'transitions',
      label: 'Project status controls',
      description: 'Live raises and productions an operator can transition.',
      icon: 'toggle_on',
      items: refunds,
    },
  ];
}

export function buildQueue(
  role: DashboardRole,
  projects: Project[],
  address: string | undefined,
  now = Date.now(),
  heldIds?: Set<string>,
): QueueSection[] {
  switch (role) {
    case 'investor':
      return buildInvestorQueue(projects, now, heldIds);
    case 'founder':
      return buildFounderQueue(projects, address, now);
    case 'admin':
      return buildAdminQueue(projects, now);
  }
}

export function totalActions(sections: QueueSection[]): number {
  return sections.reduce((sum, s) => sum + s.items.length, 0);
}
