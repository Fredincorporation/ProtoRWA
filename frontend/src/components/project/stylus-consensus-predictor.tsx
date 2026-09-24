'use client';

import * as React from 'react';
import { useReadContract } from 'wagmi';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { protocolChain } from '@/lib/wagmi';
import {
  getContracts,
  hardwareVerifierAbi,
  isDeployed,
  protocolAddressUrl,
  type Milestone,
  type Project,
} from '@protorwa/shared';

/**
 * Live prediction of the escrow's settlement decision, read from the Stylus
 * HardwareVerifier.
 *
 * This is the verifier's ACTUAL intended role: `evaluateConsensus()` mirrors
 * `MilestoneEscrow.settleReview()` and is what the UI reads to forecast the
 * outcome from the on-chain tally. It is deliberately NON-authoritative - the
 * escrow is the contract that moves money; this only tells a backer where the
 * current votes land before the window closes. Parity between the two is pinned
 * by `ConsensusParity.t.sol` and re-checked live by `verify-consensus-live.sh`.
 *
 * The old UI here claimed evidence was "attested by the HardwareVerifier" via
 * `verifyHardwareBatch`. That call is not wired to anything, so the claim was
 * decorative; it has been removed in favour of this real, on-chain read.
 */
export function StylusConsensusPredictor({
  project,
  milestone,
  milestoneIndex,
}: {
  project: Project;
  milestone: Milestone;
  milestoneIndex: number;
}) {
  const verifier = getContracts(protocolChain.id).hardwareVerifier;
  const escrow = getContracts(protocolChain.id).milestoneEscrow;
  const onChainId = project.onChainProjectId;

  // A review only exists once evidence has snapshotted eligible weight; before
  // that there is nothing to predict and the contract would return `false` for
  // the empty-voter edge case, which would read as a spurious "will reject".
  const eligible = BigInt(milestone.votes.eligible || '0');
  const isReal =
    project.liquidityMode === 'real' &&
    Boolean(onChainId) &&
    Boolean(escrow) &&
    isDeployed(protocolChain.id);
  const hasReview = isReal && eligible > 0n;

  const predicted = useReadContract({
    address: verifier,
    abi: hardwareVerifierAbi,
    functionName: 'evaluateConsensus',
    args: [
      BigInt(milestoneIndex),
      BigInt(milestone.votes.approve || '0'),
      BigInt(milestone.votes.reject || '0'),
      BigInt(milestone.votes.abstain || '0'),
      eligible,
      BigInt(milestone.quorumBps),
      BigInt(milestone.approvalThresholdBps),
    ],
    chainId: protocolChain.id,
    query: { enabled: hasReview && Boolean(verifier) },
  });

  // Nothing to forecast before evidence is submitted.
  if (!hasReview) return null;

  // Configured but no verifier address on this chain: honest, not an error.
  if (!verifier) {
    return (
      <PredictorShell>
        <Badge tone="neutral">
          <Icon name="power_off" size={12} className="mr-1" />
          Predictor offline
        </Badge>
        <p className="mt-2 font-mono text-label-sm text-on-surface-variant">
          No HardwareVerifier address is configured for {protocolChain.name}, so the
          on-chain consensus forecast is unavailable.
        </p>
      </PredictorShell>
    );
  }

  const approveLink = protocolAddressUrl(verifier);

  return (
    <PredictorShell>
      <div className="flex items-center justify-between gap-space-sm">
        <Badge tone={predicted.isLoading ? 'brand' : predicted.data ? 'success' : 'warn'}>
          <StatusDot
            tone={predicted.isLoading ? 'brand' : predicted.data ? 'success' : 'warn'}
            pulse={predicted.isLoading}
          />
          <span className="ml-1">
            {predicted.isLoading
              ? 'Reading on-chain consensus…'
              : predicted.data === undefined
                ? 'Prediction unavailable'
                : predicted.data
                  ? 'Predicted: release'
                  : 'Predicted: withhold'}
          </span>
        </Badge>
        <a
          href={approveLink ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-label-sm text-secondary underline-offset-2 hover:underline"
        >
          evaluateConsensus()
        </a>
      </div>
      <p className="mt-2 font-mono text-label-sm text-on-surface-variant">
        {predicted.data === undefined
          ? 'The Stylus verifier did not return a prediction; the escrow tally above is the source of truth.'
          : `Forecast from the current on-chain tally via the Stylus HardwareVerifier. Non-authoritative — ${
              predicted.data ? 'releases' : 'withholds'
            } only if votes hold until the window closes; MilestoneEscrow.settleReview() is final.`}
      </p>
    </PredictorShell>
  );
}

function PredictorShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-secondary/30 bg-surface-container-low p-space-md">
      <div className="mb-space-xs flex items-center gap-space-sm font-mono text-label-sm uppercase tracking-wider text-secondary">
        <Icon name="settings_ethernet" size={15} />
        Stylus consensus predictor
      </div>
      {children}
    </section>
  );
}
