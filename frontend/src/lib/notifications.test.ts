import { describe, expect, it } from 'vitest';

import type { Milestone, Project } from '@protorwa/shared';

import { buildAlerts, countAlerts, filterAlerts } from './notifications';

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
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
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

describe('buildAlerts', () => {
  it('emits a vote alert for an EVIDENCE milestone and marks it actionable', () => {
    const alerts = buildAlerts(
      [
        project({
          milestones: [
            milestone({
              status: 'EVIDENCE',
              votingEndsAt: '2026-06-20T00:00:00.000Z',
            }),
          ],
        }),
      ],
      NOW,
    );
    const vote = alerts.find((a) => a.kind === 'VOTING_OPEN');
    expect(vote).toBeDefined();
    expect(vote?.actionable).toBe(true);
    expect(vote?.href).toBe('/projects/demo-build/milestones/0/vote');
    expect(vote?.severity).toBe('INFO');
  });

  it('escalates severity when the vote window is closing within three days', () => {
    const alerts = buildAlerts(
      [project({ milestones: [milestone({ status: 'EVIDENCE', votingEndsAt: '2026-06-02T00:00:00.000Z' })] })],
      NOW,
    );
    expect(alerts.find((a) => a.kind === 'VOTING_OPEN')?.severity).toBe('WARNING');
  });

  it('labels live projects as live and showcases as demo', () => {
    const live = buildAlerts(
      [project({ liquidityMode: 'real', milestones: [milestone({ status: 'APPROVED', approvedAt: '2026-05-20T00:00:00.000Z' })] })],
      NOW,
    );
    const demo = buildAlerts(
      [project({ liquidityMode: 'demo', milestones: [milestone({ status: 'APPROVED', approvedAt: '2026-05-20T00:00:00.000Z' })] })],
      NOW,
    );
    expect(live.find((a) => a.kind === 'TRANCHE_RELEASED')?.source).toBe('live');
    expect(demo.find((a) => a.kind === 'TRANCHE_RELEASED')?.source).toBe('demo');
  });

  it('raises a CRITICAL dispute alert linked to the admin terminal', () => {
    const alerts = buildAlerts(
      [project({ milestones: [milestone({ status: 'DISPUTED', disputeReason: 'telemetry mismatch' })] })],
      NOW,
    );
    const dispute = alerts.find((a) => a.kind === 'PROTOCOL_ALERT');
    expect(dispute?.severity).toBe('CRITICAL');
    expect(dispute?.href).toBe('/admin');
    expect(dispute?.body).toMatch(/telemetry mismatch/);
  });

  it('surfaces a refund alert for cancelled and defaulted builds', () => {
    const cancelled = buildAlerts([project({ status: 'CANCELLED' })], NOW);
    expect(cancelled.find((a) => a.kind === 'REFUND_AVAILABLE')?.actionable).toBe(true);
    const defaulted = buildAlerts([project({ status: 'DEFAULTED' })], NOW);
    expect(defaulted.find((a) => a.kind === 'REFUND_AVAILABLE')?.body).toMatch(/defaulted/);
  });

  it('invents nothing for a settled, non-refundable build', () => {
    const alerts = buildAlerts([project({ status: 'COMPLETED', milestones: [milestone({ status: 'PENDING' })] })], NOW);
    expect(alerts).toHaveLength(0);
  });

  it('sorts newest first by createdAt', () => {
    const alerts = buildAlerts(
      [
        project({ slug: 'old', updatedAt: '2026-01-01T00:00:00.000Z', milestones: [milestone({ status: 'APPROVED', approvedAt: '2026-01-01T00:00:00.000Z' })] }),
        project({ slug: 'new', updatedAt: '2026-05-01T00:00:00.000Z', milestones: [milestone({ status: 'APPROVED', approvedAt: '2026-05-01T00:00:00.000Z' })] }),
      ],
      NOW,
    );
    expect(alerts[0]?.projectSlug).toBe('new');
  });
});

describe('filterAlerts + countAlerts', () => {
  const alerts = buildAlerts(
    [
      project({ slug: 'a', milestones: [milestone({ status: 'EVIDENCE', votingEndsAt: '2026-06-20T00:00:00.000Z' })] }),
      project({ slug: 'b', milestones: [milestone({ status: 'DISPUTED' })] }),
      project({ slug: 'c', status: 'CANCELLED' }),
      project({ slug: 'd', milestones: [milestone({ status: 'APPROVED', approvedAt: '2026-05-01T00:00:00.000Z' })] }),
    ],
    NOW,
  );

  it('the votes pill only returns open votes', () => {
    const votes = filterAlerts(alerts, 'votes');
    expect(votes.every((a) => a.kind === 'VOTING_OPEN')).toBe(true);
    expect(votes.length).toBeGreaterThan(0);
  });

  it('action filter matches countAlerts.actionable', () => {
    expect(filterAlerts(alerts, 'action').length).toBe(countAlerts(alerts).actionable);
  });

  it('payouts covers releases and refunds', () => {
    const payouts = filterAlerts(alerts, 'payouts');
    expect(payouts.some((a) => a.kind === 'TRANCHE_RELEASED')).toBe(true);
    expect(payouts.some((a) => a.kind === 'REFUND_AVAILABLE')).toBe(true);
  });

  it('all returns the whole stream', () => {
    expect(filterAlerts(alerts, 'all')).toHaveLength(alerts.length);
    expect(countAlerts(alerts).byFilter.all).toBe(alerts.length);
  });
});
