'use client';

import * as React from 'react';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { SegmentedProgress } from '@/components/ui/progress';
import { formatCountdown, formatNumber, formatUsdg, percentOf } from '@/lib/format';
import { milestoneStatus } from '@/lib/status';
import { cn } from '@/lib/utils';
import { PROTOCOL, type Milestone } from '@protorwa/shared';

/**
 * Milestone voting panel.
 *
 * Layout follows screen 06 (Voting Consensus Terminal): a quorum meter across the
 * top, evidence on the left, and an execution desk on the right with the
 * approve / reject / abstain actions and the live consensus split.
 *
 * The voting rules mirror MilestoneEscrow.sol exactly, and the numbers shown are
 * computed with the same formulas the contract uses, so what the UI says will
 * happen is what the contract does.
 */

export interface MilestoneVotePanelProps {
  milestone: Milestone;
  /** Approved / rejected / abstained, in basis points of eligible weight. */
  eligibleWeight: string;
  /** Whether the connected viewer holds claims (can vote). */
  canVote: boolean;
  /** Whether the viewer has already voted on this milestone. */
  hasVoted: boolean;
  /** True while a transaction is in flight. */
  pending?: boolean;
  onVote?: (choice: 'approve' | 'reject' | 'abstain') => void;
}

/** Quorum meter bar shown above the panel. */
export function QuorumMeter({
  milestone,
  now = new Date(),
}: {
  milestone: Milestone;
  now?: Date;
}) {
  const eligible = BigInt(milestone.votes.eligible || '0');
  const approve = BigInt(milestone.votes.approve || '0');
  const reject = BigInt(milestone.votes.reject || '0');
  const abstain = BigInt(milestone.votes.abstain || '0');

  const cast = approve + reject + abstain;
  const participation = percentOf(cast, eligible);
  const quorumNeeded = milestone.quorumBps / 100;
  const approvePct = percentOf(approve, eligible);
  const thresholdPct = milestone.approvalThresholdBps / 100;

  const quorumMet = participation >= quorumNeeded;
  const thresholdMet = approvePct >= thresholdPct;
  const willPass = quorumMet && thresholdMet;

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
      <div className="mb-space-sm flex-wrap items-center justify-between gap-space-sm">
        <div className="flex flex-wrap items-center gap-space-sm">
          <Icon name="ballot" size={20} className="shrink-0 text-primary" />
          <span className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
            Quorum Participation Rate
          </span>
          <Badge tone={willPass ? 'success' : 'warn'} className="whitespace-nowrap">
            {willPass ? 'Passing' : quorumMet ? 'Below threshold' : 'No quorum'}
          </Badge>
        </div>
        <div className="flex items-center gap-space-sm font-mono text-label-sm">
          <span className="text-on-surface-variant">
            Window closes{' '}
            <span className="text-on-surface">{formatCountdown(milestone.votingEndsAt, now)}</span>
          </span>
        </div>
      </div>

      {/*
       * Participation against the quorum requirement.
       *
       * The bar tracks `participation` (cast / eligible), NOT approval share, so
       * it can legitimately differ from the approve/reject/abstain split below.
       * The marker shows where the quorum line falls.
       */}
      <div className="space-y-1">
        <div className="flex justify-between font-mono text-label-sm">
          <span className="text-on-surface-variant">
            Cast: <span className="tabular text-on-surface">{participation.toFixed(2)}%</span>
          </span>
          <span className="text-on-surface-variant">
            Quorum required: <span className="tabular text-on-surface">{quorumNeeded}%</span>
          </span>
        </div>
        <div
          className="relative h-2 w-full overflow-hidden rounded bg-surface-container-lowest"
          role="progressbar"
          aria-valuenow={Math.round(participation)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Quorum participation: ${participation.toFixed(2)}% of ${quorumNeeded}% required`}
        >
          <div
            className={cn('h-full rounded', quorumMet ? 'bg-primary' : 'bg-tertiary')}
            style={{ width: `${Math.min(100, participation)}%` }}
          />
          {/* Quorum marker: the line the bar has to cross. */}
          <span
            className="absolute top-0 h-full w-px bg-on-surface/70"
            style={{ left: `${Math.min(100, quorumNeeded)}%` }}
            aria-hidden
          />
        </div>
      </div>

      {/* Vote split. */}
      <div className="mt-space-sm">
        <SegmentedProgress
          total={100}
          segments={[
            {
              value: percentOf(approve, eligible),
              className: 'bg-primary',
              label: `Approve ${percentOf(approve, eligible).toFixed(1)}%`,
            },
            {
              value: percentOf(reject, eligible),
              className: 'bg-error',
              label: `Reject ${percentOf(reject, eligible).toFixed(1)}%`,
            },
            {
              value: percentOf(abstain, eligible),
              className: 'bg-outline',
              label: `Abstain ${percentOf(abstain, eligible).toFixed(1)}%`,
            },
          ]}
        />
      </div>

      <div className="mt-space-sm grid-cols-3 gap-space-sm border-t border-outline-variant/30 pt-space-sm font-mono text-label-sm">
        <div>
          <div className="text-outline">Eligible claims</div>
          {/*
           * Vote weight is expressed in whole claim units, not raw base units.
           * Balances are USDG-scale (6 decimals), so divide by 1e6 to recover the
           * claim count; the old 1e18 wei divisor printed near-zero values.
           */}
          <div className="tabular text-on-surface">
            {formatNumber(Number(eligible) / 1e6)} claims
          </div>
        </div>
        <div>
          <div className="text-outline">Approval threshold</div>
          <div className="tabular text-on-surface">{thresholdPct}%</div>
        </div>
        <div>
          <div className="text-outline">Tranche at stake</div>
          <div className="tabular text-secondary">
            {formatUsdg(milestone.trancheAmount, 2)}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Voting execution desk. */
export function VotingDesk({
  milestone,
  canVote,
  hasVoted,
  pending = false,
  onVote,
}: MilestoneVotePanelProps) {
  const status = milestoneStatus(milestone.status);
  const isVoting = milestone.status === 'EVIDENCE';

  return (
    <div className="flex flex-col gap-space-md rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
      <div className="flex items-start justify-between gap-space-sm">
        <div>
          <h3 className="font-display text-headline-sm text-on-surface">Voting Execution Desk</h3>
          <p className="text-body-sm text-on-surface-variant">
            Your vote is weighted by the claim balance snapshotted when evidence
            was submitted.
          </p>
        </div>
        <Badge tone={status.tone}>
          <StatusDot tone={status.tone === 'brand' ? 'brand' : 'neutral'} pulse={isVoting} />
          {status.label}
        </Badge>
      </div>

      {/* Rule disclosure: mirrors MilestoneEscrow.settleReview. */}
      <div className="rounded bg-surface-container-lowest p-space-sm font-mono text-label-sm text-on-surface-variant">
        <div className="mb-1 uppercase tracking-wider text-outline">Release conditions</div>
        <ul className="space-y-0.5">
          <li>
            Quorum ≥ {milestone.quorumBps / 100}% of snapshotted eligible weight
          </li>
          <li>
            Approve ≥ {milestone.approvalThresholdBps / 100}% of eligible weight
          </li>
          <li>Vote weight fixed at evidence submission (no post-snapshot accrual)</li>
        </ul>
      </div>

      {isVoting && canVote && !hasVoted ? (
        <div className="flex flex-col gap-space-sm">
          <Button
            variant="primary"
            onClick={() => onVote?.('approve')}
            disabled={pending}
            className="justify-start"
          >
            <Icon name="check_circle" size={18} />
            Approve evidence and release tranche
          </Button>
          <Button
            variant="danger"
            onClick={() => onVote?.('reject')}
            disabled={pending}
            className="justify-start text-left"
          >
            <Icon name="cancel" size={18} />
            Reject evidence and keep capital in escrow
          </Button>
          <Button
            variant="outline"
            onClick={() => onVote?.('abstain')}
            disabled={pending}
            className="justify-start"
          >
            <Icon name="remove_circle" size={18} />
            Abstain (counts toward quorum only)
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-space-sm rounded border-outline-variant/40 bg-surface-container-lowest p-space-sm">
          <Icon
            name={hasVoted ? 'how_to_vote' : isVoting ? 'lock' : 'schedule'}
            size={18}
            className="shrink-0 text-outline"
          />
          <p className="text-body-sm text-on-surface-variant">
            {hasVoted
              ? 'You have voted on this milestone. Results finalise when the window closes.'
              : !isVoting
                ? `This milestone is ${status.label.toLowerCase()}. ${status.description}`
                : 'You need claim units in this project to vote on its milestones.'}
          </p>
        </div>
      )}

      {/* Permissionless settlement note - matches the contract's design. */}
      {isVoting ? (
        <p className="font-mono text-label-sm text-outline">
          Settlement is permissionless: anyone can finalise after the window
          closes, since the result is a function of recorded votes.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Evidence list. Artefacts are IPFS pointers, so these link to a gateway rather
 * than embedding untrusted content.
 */
export function EvidenceList({ milestone }: { milestone: Milestone }) {
  if (milestone.evidence.length === 0) {
    return (
      <div className="rounded border-dashed border-outline-variant/40 bg-surface-container-lowest p-space-md text-center font-mono text-label-sm text-outline">
        No evidence submitted for this milestone yet.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-space-xs">
      {milestone.evidence.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between gap-space-sm rounded border-outline-variant/40 bg-surface-container-lowest p-space-sm"
        >
          <div className="flex min-w-0 items-center gap-space-sm">
            <Icon
              name={item.mimeType.startsWith('image/') ? 'image' : 'description'}
              size={18}
              className="shrink-0 text-secondary"
            />
            <div className="min-w-0">
              <div className="truncate text-body-sm text-on-surface">{item.label}</div>
              <div className="truncate font-mono text-label-sm text-outline">
                {item.cid.slice(0, 24)}…
              </div>
            </div>
          </div>
          <a
            href={`https://ipfs.io/ipfs/${item.cid}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center gap-1 font-mono text-label-sm text-primary hover:underline"
          >
            Open
            <Icon name="open_in_new" size={14} />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Exported so screens can render the same default the contract uses. */
export const defaultThresholdBps = PROTOCOL.DEFAULT_APPROVAL_THRESHOLD_BPS;
