import { describe, expect, it } from 'vitest';

import type { Milestone, Project } from '@protorwa/shared';

import {
  buildAdminQueue,
  buildFounderQueue,
  buildInvestorQueue,
  buildQueue,
  dashboardPathFor,
  isDashboardRole,
  participatedProjectIds,
  totalActions,
  type QueueSection,
} from './dashboard';

/** A project/milestone builder covering only the fields the queues read. */
function project(over: Partial<Project> & { milestones?: Milestone[] } = {}): Project {
  return {
    id: '1',
    slug: 'demo-build',
    title: 'Demo Build',
    tagline: '',
    description: '',
    status: 'IN_PRODUCTION',
    category: 'OTHER',
    founder: '0xf000000000000000000000000000000000000000',
    manufacturingLocation: '',
    coverCid: '',
    galleryCids: [],
    pitchVideoCid: null,
    claimPrice: '5000000',
    totalClaims: '1000',
    claimsCommitted: '1000',
    claimTokenId: '1',
    escrow: {
      totalCommitted: '5000000000',
      totalReleased: '0',
      totalRefunded: '0',
      locked: '5000000000',
      target: '5000000000',
      fundingDeadline: '2030-01-01T00:00:00.000Z',
    },
    milestones: [],
    createdAt: '2030-01-01T00:00:00.000Z',
    updatedAt: '2030-01-01T00:00:00.000Z',
    liquidityMode: 'demo',
    ...over,
  } as Project;
}

function milestone(over: Partial<Milestone> = {}): Milestone {
  return {
    index: 0,
    title: 'M1',
    description: '',
    trancheAmount: '1500000000',
    dueAt: '2030-01-01T00:00:00.000Z',
    status: 'PENDING',
    votingPeriodSeconds: 604800,
    votingEndsAt: null,
    approvalThresholdBps: 6000,
    quorumBps: 4000,
    votes: { approve: '0', reject: '0', abstain: '0', eligible: '10000' },
    evidence: [],
    approvedAt: null,
    disputeReason: null,
    ...over,
  } as Milestone;
}

const NOW = Date.parse('2026-06-01T00:00:00.000Z');

function items(sections: QueueSection[], id: string) {
  return sections.find((s) => s.id === id)?.items ?? [];
}

describe('role meta / routing helpers', () => {
  it('recognises the three dashboard roles only', () => {
    expect(isDashboardRole('investor')).toBe(true);
    expect(isDashboardRole('founder')).toBe(true);
    expect(isDashboardRole('admin')).toBe(true);
    expect(isDashboardRole('trade')).toBe(false);
    expect(isDashboardRole('')).toBe(false);
  });

  it('maps a role to a dashboard path', () => {
    expect(dashboardPathFor('investor')).toBe('/dashboard/investor');
    expect(dashboardPathFor('admin')).toBe('/dashboard/admin');
  });
});

describe('buildInvestorQueue', () => {
  it('routes FUNDING to invest, tradable to market, refundable to an inline refund', () => {
    const projects = [
      project({ slug: 'open', status: 'FUNDING' }),
      project({ slug: 'prod', status: 'IN_PRODUCTION' }),
      project({ slug: 'gone', status: 'CANCELLED' }),
    ];
    const q = buildInvestorQueue(projects, NOW);
    expect(items(q, 'invest').map((i) => i.projectSlug)).toEqual(['open']);
    expect(items(q, 'trade').map((i) => i.projectSlug)).toEqual(['prod']);

    const refundRow = items(q, 'refunds')[0];
    expect(refundRow?.projectSlug).toBe('gone');
    expect(refundRow?.inline).toBe('refund');
    expect(refundRow?.urgent).toBe(true);
  });

  it('surfaces an open EVIDENCE milestone as a vote and marks it urgent near close', () => {
    const soon = new Date(NOW + 60_000).toISOString();
    const later = new Date(NOW + 30 * 86_400_000).toISOString();
    const projects = [
      project({ slug: 'closing', milestones: [milestone({ status: 'EVIDENCE', votingEndsAt: soon })] }),
      project({ slug: 'open', milestones: [milestone({ status: 'EVIDENCE', votingEndsAt: later })] }),
    ];
    const votes = items(buildInvestorQueue(projects, NOW), 'votes');
    const closing = votes.find((v) => v.projectSlug === 'closing');
    const open = votes.find((v) => v.projectSlug === 'open');
    expect(closing?.urgent).toBe(true);
    expect(open?.urgent).toBe(false);
    // urgent sorts first
    expect(votes[0]?.projectSlug).toBe('closing');
  });

  it('labels a live project live and a fixture demo', () => {
    const q = buildInvestorQueue(
      [
        project({ slug: 'real', status: 'FUNDING', liquidityMode: 'real' }),
        project({ slug: 'fake', status: 'FUNDING', liquidityMode: 'demo' }),
      ],
      NOW,
    );
    const invest = items(q, 'invest');
    expect(invest.find((i) => i.projectSlug === 'real')?.source).toBe('live');
    expect(invest.find((i) => i.projectSlug === 'fake')?.source).toBe('demo');
  });

  it('ignores DRAFT/COMPLETED for invest and only trades IN_PRODUCTION/COMPLETED', () => {
    const q = buildInvestorQueue(
      [project({ slug: 'draft', status: 'DRAFT' }), project({ slug: 'done', status: 'COMPLETED' })],
      NOW,
    );
    expect(items(q, 'invest')).toHaveLength(0);
    expect(items(q, 'trade').map((i) => i.projectSlug)).toEqual(['done']);
  });
});

describe('buildFounderQueue', () => {
  const founder = '0xabc0000000000000000000000000000000000001';

  it('only surfaces projects owned by the connected address', () => {
    const projects = [
      project({ slug: 'mine', founder, status: 'IN_PRODUCTION', milestones: [milestone({ status: 'PENDING' })] }),
      project({ slug: 'theirs', founder: '0xdead000000000000000000000000000000000000' }),
    ];
    const q = buildFounderQueue(projects, founder, NOW);
    expect(items(q, 'evidence').map((i) => i.projectSlug)).toEqual(['mine']);
    expect(items(q, 'evidence')[0]?.mine).toBe(true);
  });

  it('returns nothing but the launch CTA when the wallet owns no project', () => {
    const q = buildFounderQueue([project({ slug: 'theirs' })], founder, NOW);
    expect(items(q, 'evidence')).toHaveLength(0);
    expect(items(q, 'raises')).toHaveLength(0);
    expect(items(q, 'new').map((i) => i.href)).toEqual(['/studio/new']);
  });

  it('treats a REJECTED milestone as a resubmit row and an overdue PENDING as urgent', () => {
    const past = new Date(NOW - 86_400_000).toISOString();
    const projects = [
      project({
        slug: 'mine',
        founder,
        milestones: [
          milestone({ index: 0, status: 'REJECTED' }),
          milestone({ index: 1, status: 'PENDING', dueAt: past }),
        ],
      }),
    ];
    const rows = items(buildFounderQueue(projects, founder, NOW), 'evidence');
    const rejected = rows.find((r) => r.href.endsWith('/milestones/0/submit'));
    const overdue = rows.find((r) => r.href.endsWith('/milestones/1/submit'));
    expect(rejected?.detail).toMatch(/resubmit/i);
    expect(overdue?.urgent).toBe(true);
  });

  it('handles an undefined address without throwing', () => {
    expect(() => buildFounderQueue([project()], undefined, NOW)).not.toThrow();
    expect(items(buildFounderQueue([project()], undefined, NOW), 'evidence')).toHaveLength(0);
  });
});

describe('buildAdminQueue', () => {
  it('separates disputes from open reviews and flags closing windows', () => {
    const soon = new Date(NOW + 60_000).toISOString();
    const projects = [
      project({
        slug: 'live',
        status: 'IN_PRODUCTION',
        liquidityMode: 'real',
        milestones: [
          milestone({ index: 0, status: 'DISPUTED', disputeReason: 'telemetry mismatch' }),
          milestone({ index: 1, status: 'EVIDENCE', votingEndsAt: soon }),
        ],
      }),
    ];
    const q = buildAdminQueue(projects, NOW);
    const dispute = items(q, 'disputes')[0];
    expect(dispute?.detail).toMatch(/telemetry mismatch/);
    expect(dispute?.source).toBe('live');
    const review = items(q, 'reviews')[0];
    expect(review?.urgent).toBe(true);
    expect(review?.href).toBe('/admin');
  });

  it('lists a status-control row for active projects', () => {
    const q = buildAdminQueue([project({ slug: 'prod', status: 'IN_PRODUCTION' })], NOW);
    expect(items(q, 'transitions').map((i) => i.projectSlug)).toEqual(['prod']);
  });
});

describe('buildQueue + totalActions', () => {
  it('dispatches by role', () => {
    const projects = [project({ status: 'FUNDING' })];
    expect(totalActions(buildQueue('investor', projects, undefined, NOW))).toBeGreaterThan(0);
    expect(items(buildQueue('founder', projects, undefined, NOW), 'evidence')).toHaveLength(0);
    expect(buildQueue('admin', projects, undefined, NOW)).toHaveLength(3);
  });
});

describe('participatedProjectIds', () => {
  it('counts a real project only when the live balance is non-zero', () => {
    const projects = [
      project({ id: 'r1', slug: 'r1', liquidityMode: 'real', onChainProjectId: '7', status: 'IN_PRODUCTION' }),
      project({ id: 'r2', slug: 'r2', liquidityMode: 'real', onChainProjectId: '8', status: 'IN_PRODUCTION' }),
    ];
    const balances = new Map<string, bigint>([['7', 500n], ['8', 0n]]);
    const ids = participatedProjectIds(projects, balances, new Set());
    expect([...ids]).toEqual(['r1']);
  });

  it('uses demo positions to include showcase projects', () => {
    const projects = [
      project({ id: 'd1', slug: 'd1', liquidityMode: 'demo', status: 'COMPLETED' }),
      project({ id: 'd2', slug: 'd2', liquidityMode: 'demo', status: 'IN_PRODUCTION' }),
    ];
    const ids = participatedProjectIds(projects, new Map(), new Set(['d2']));
    expect([...ids]).toEqual(['d2']);
  });
});

describe('buildInvestorQueue with holdings', () => {
  it('limits the trade tab to participated projects when heldIds is supplied', () => {
    const projects = [
      project({ id: 'a', slug: 'a', status: 'IN_PRODUCTION' }),
      project({ id: 'b', slug: 'b', status: 'COMPLETED' }),
    ];
    const all = items(buildInvestorQueue(projects, NOW), 'trade').map((i) => i.projectSlug);
    expect(all).toEqual(['a', 'b']);

    const held = items(buildInvestorQueue(projects, NOW, new Set(['a'])), 'trade');
    expect(held.map((i) => i.projectSlug)).toEqual(['a']);
    expect(held[0]?.mine).toBe(true);
  });

  it('shows no participated positions but keeps the tab when the wallet holds none', () => {
    const projects = [project({ id: 'a', slug: 'a', status: 'IN_PRODUCTION' })];
    const trade = items(buildInvestorQueue(projects, NOW, new Set()), 'trade');
    expect(trade).toHaveLength(0);
  });
});
