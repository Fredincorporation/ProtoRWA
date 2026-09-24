'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

import { VotingDesk } from '@/components/project/milestone-vote-panel';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { protocolChain } from '@/lib/wagmi';
import { getContracts, isDeployed, milestoneEscrowAbi, type Milestone, type Project } from '@protorwa/shared';

/**
 * Interactive voting desk for a live project's milestone.
 *
 * The aggregate tally and window come from the server read (chain.ts derives
 * them from the escrow review). This component layers the wallet-specific
 * state the server cannot know - whether THIS address is still in the snapshot
 * electorate, whether it has already voted, and whether the window is open
 * right now - and wires the `vote()` and `settleReview()` writes.
 *
 * Gating mirrors MilestoneEscrow.vote(): a vote needs a non-zero snapshotted
 * weight, an open window, and no prior vote. A showcase (`liquidityMode` not
 * 'real') has no live escrow, so it renders the desk inert and labelled.
 */
export function MilestoneVoteConsole({
  project,
  milestone,
  milestoneIndex,
}: {
  project: Project;
  milestone: Milestone;
  milestoneIndex: number;
}) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const escrow = getContracts(protocolChain.id).milestoneEscrow;
  const onChainId = project.onChainProjectId;
  const isReal = project.liquidityMode === 'real' && Boolean(onChainId) && Boolean(escrow) && isDeployed(protocolChain.id);
  const pid = onChainId !== undefined ? BigInt(onChainId) : 0n;
  const idx = BigInt(milestoneIndex);

  // Authoritative, per-wallet window/eligibility reads (live, not cached like the
  // server render), so the buttons reflect on-chain truth the moment they load.
  const votingOpen = useReadContract({
    address: escrow,
    abi: milestoneEscrowAbi,
    functionName: 'isVotingOpen',
    args: [pid, idx],
    chainId: protocolChain.id,
    query: { enabled: isReal && Boolean(escrow) },
  });
  const myVote = useReadContract({
    address: escrow,
    abi: milestoneEscrowAbi,
    functionName: 'hasVoted',
    args: escrow && address ? [pid, idx, address] : undefined,
    chainId: protocolChain.id,
    query: { enabled: isReal && Boolean(address) },
  });
  const myWeight = useReadContract({
    address: escrow,
    abi: milestoneEscrowAbi,
    functionName: 'snapshotWeight',
    args: escrow && address ? [pid, address] : undefined,
    chainId: protocolChain.id,
    query: { enabled: isReal && Boolean(address) },
  });

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (receipt.isSuccess) {
      setNotice('Vote recorded on-chain. Refreshing the tally…');
      router.refresh();
      reset();
    }
  }, [receipt.isSuccess]);

  const connectedOnChain = isConnected && chainId === protocolChain.id;
  const windowOpen = Boolean(votingOpen.data);
  const hasSnapshotWeight = (myWeight.data ?? 0n) > 0n;
  const alreadyVoted = Boolean(myVote.data);
  const canVote = isReal && connectedOnChain && windowOpen && hasSnapshotWeight && !alreadyVoted;

  // chain.ts marks a milestone EVIDENCE exactly while its review.open is true.
  // isVotingOpen() is false only once the deadline has passed, so the two
  // together pin down "window expired but not yet settled" - the one state where
  // a permissionless settleReview() call is both valid and useful.
  const expiredUnsettled =
    milestone.status === 'EVIDENCE' && votingOpen.isSuccess && !windowOpen;
  const settleable = isReal && connectedOnChain && expiredUnsettled;

  const submitVote = (choice: 'approve' | 'reject' | 'abstain') => {
    if (!escrow || !canVote) return;
    reset();
    setNotice(null);
    writeContract({
      address: escrow,
      abi: milestoneEscrowAbi,
      functionName: 'vote',
      args: [pid, idx, choice === 'approve', choice === 'abstain'],
      chainId: protocolChain.id,
    });
  };

  const settle = () => {
    if (!escrow || !settleable) return;
    reset();
    setNotice(null);
    writeContract({
      address: escrow,
      abi: milestoneEscrowAbi,
      functionName: 'settleReview',
      args: [pid, idx],
      chainId: protocolChain.id,
    });
  };

  return (
    <div className="flex flex-col gap-space-sm">
      {isReal ? (
        <VotingDesk
          milestone={milestone}
          eligibleWeight={milestone.votes.eligible}
          canVote={canVote}
          hasVoted={alreadyVoted}
          pending={isPending || receipt.isLoading}
          onVote={submitVote}
        />
      ) : (
        <VotingDesk
          milestone={milestone}
          eligibleWeight={milestone.votes.eligible}
          canVote={false}
          hasVoted={false}
        />
      )}

      {!isReal ? (
        <p className="flex items-start gap-1.5 font-mono text-label-sm text-outline">
          <Icon name="science" size={13} className="mt-0.5 shrink-0" />
          <span>
            Showcase milestone on simulated data - this demo project has no live escrow, so voting
            is disabled here. Live projects published to the registry accept real votes.
          </span>
        </p>
      ) : !connectedOnChain && isReal ? (
        <p className="flex items-start gap-1.5 font-mono text-label-sm text-outline">
          <Icon name="account_balance_wallet" size={13} className="mt-0.5 shrink-0" />
          <span>
            {isConnected
              ? `Switch to ${protocolChain.name} to vote.`
              : 'Connect a wallet holding this project’s claims (at the evidence snapshot) to vote.'}
          </span>
        </p>
      ) : null}

      {settleable ? (
        <Button variant="outline" onClick={settle} disabled={isPending || receipt.isLoading} className="w-full justify-center">
          <Icon name="gavel" size={16} />
          Finalise review (settleReview)
        </Button>
      ) : null}

      {writeError ? (
        <p className="font-mono text-label-sm text-error">{(writeError as Error).message}</p>
      ) : null}
      {notice ? <p className="font-mono text-label-sm text-primary">{notice}</p> : null}
    </div>
  );
}
