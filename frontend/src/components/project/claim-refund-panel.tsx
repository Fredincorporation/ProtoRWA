'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { formatNumber, formatUsdg } from '@/lib/format';
import { isRefundableStatus, projectStatus } from '@/lib/status';
import { protocolChain } from '@/lib/wagmi';
import {
  claimTokenAbi,
  getContracts,
  isDeployed,
  milestoneEscrowAbi,
  protocolTxUrl,
  type Project,
} from '@protorwa/shared';

/**
 * Holder refund desk for a cancelled or defaulted project.
 *
 * `MilestoneEscrow.claimRefund(projectId)` burns the caller's claim balance and
 * returns a pro-rata share of whatever is still locked in escrow. The payout is
 * computed on-chain, so this desk only needs to (a) prove the caller holds
 * claims worth refunding and (b) preview the amount from live escrow reads. It
 * never guesses a settlement figure the contract might not honour - the preview
 * is labelled "estimated" and the authoritative number comes back as the tx.
 *
 * Gating mirrors the contract's own guards: the project must be CANCELLED or
 * DEFAULTED, the escrow deployed, the caller connected on the protocol chain,
 * and holding a non-zero claim balance. A showcase project (`liquidityMode`
 * not 'real') has no escrow, so it renders an inert, labelled desk.
 */
export function ClaimRefundPanel({ project }: { project: Project }) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const escrow = getContracts(protocolChain.id).milestoneEscrow;
  const claimToken = getContracts(protocolChain.id).claimToken;
  const onChainId = project.onChainProjectId;
  const pid = onChainId !== undefined ? BigInt(onChainId) : 0n;

  const isReal =
    project.liquidityMode === 'real' &&
    Boolean(onChainId) &&
    Boolean(escrow) &&
    Boolean(claimToken) &&
    isDeployed(protocolChain.id);

  const status = projectStatus(project.status);

  const myClaims = useReadContract({
    address: claimToken,
    abi: claimTokenAbi,
    functionName: 'balanceOf',
    args: claimToken && address ? [address, pid] : undefined,
    chainId: protocolChain.id,
    query: { enabled: isReal && Boolean(claimToken) && Boolean(address) },
  });
  const pool = useReadContract({
    address: escrow,
    abi: milestoneEscrowAbi,
    functionName: 'escrowBalance',
    args: [pid],
    chainId: protocolChain.id,
    query: { enabled: isReal && Boolean(escrow) },
  });
  const supply = useReadContract({
    address: claimToken,
    abi: claimTokenAbi,
    functionName: 'totalSupply',
    args: [pid],
    chainId: protocolChain.id,
    query: { enabled: isReal && Boolean(claimToken) },
  });

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (receipt.isSuccess) {
      setNotice('Refund claimed - your share of the escrow was returned and your claims burned.');
      router.refresh();
      reset();
    }
  }, [receipt.isSuccess]);

  const connectedOnChain = isConnected && chainId === protocolChain.id;
  const balance = myClaims.data ?? 0n;
  const canClaim = Boolean(isReal && isRefundableStatus(project.status) && connectedOnChain && balance > 0n);

  // Estimated pro-rata payout, mirroring the contract: pool * balance / supply.
  const estimate =
    pool.data !== undefined && supply.data !== undefined && supply.data > 0n
      ? (pool.data * balance) / supply.data
      : null;

  const claim = () => {
    if (!escrow || !canClaim) return;
    reset();
    setNotice(null);
    writeContract({
      address: escrow,
      abi: milestoneEscrowAbi,
      functionName: 'claimRefund',
      args: [pid],
      chainId: protocolChain.id,
    });
  };

  // Showcase project: exercise the layout, but be honest that nothing settles.
  if (!isReal) {
    return (
      <section className="rounded-lg border border-outline-variant/40 bg-surface-container p-space-md">
        <header className="mb-space-sm flex items-center justify-between gap-space-sm">
          <h2 className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
            Claim Refund
          </h2>
          <Badge tone={status.tone}>{status.label}</Badge>
        </header>
        <p className="flex items-start gap-1.5 font-mono text-label-sm text-outline">
          <Icon name="science" size={13} className="mt-0.5 shrink-0" />
          <span>
            Showcase project on simulated data - this record has no live escrow, so there is nothing
            to refund. Live cancelled or defaulted projects accept real refunds.
          </span>
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-outline-variant/40 bg-surface-container p-space-md">
      <header className="mb-space-sm flex items-center justify-between gap-space-sm">
        <h2 className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
          Claim Refund
        </h2>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>

      <p className="mb-space-sm text-body-sm text-on-surface-variant">
        This project was {project.status === 'CANCELLED' ? 'cancelled' : 'defaulted'}. Claim holders
        can burn their claim units for a pro-rata share of the capital still held in escrow.
      </p>

      <dl className="mb-space-sm grid grid-cols-2 gap-px overflow-hidden rounded bg-outline-variant/20 font-mono text-label-sm">
        <div className="flex flex-col gap-0.5 bg-surface-container-lowest px-space-sm py-1.5">
          <dt className="text-outline">Your claims</dt>
          <dd className="tabular text-on-surface">
            {myClaims.isLoading && address ? '…' : formatNumber(Number(balance))}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 bg-surface-container-lowest px-space-sm py-1.5">
          <dt className="text-outline">Estimated payout</dt>
          <dd className="tabular text-primary">
            {estimate !== null ? formatUsdg(estimate, 2) : '—'}
          </dd>
        </div>
      </dl>

      {canClaim ? (
        <Button
          variant="primary"
          onClick={claim}
          disabled={isPending || receipt.isLoading}
          className="w-full justify-center"
        >
          <Icon name={isPending || receipt.isLoading ? 'autorenew' : 'payments'} size={18} className={isPending || receipt.isLoading ? 'animate-spin' : undefined} />
          Claim refund (burn {formatNumber(Number(balance))} claims)
        </Button>
      ) : (
        <div className="flex items-center gap-space-sm rounded border border-outline-variant/40 bg-surface-container-lowest p-space-sm">
          <Icon
            name={connectedOnChain ? 'inbox' : 'account_balance_wallet'}
            size={16}
            className="shrink-0 text-outline"
          />
          <p className="text-body-sm text-on-surface-variant">
            {!connectedOnChain
              ? isConnected
                ? `Switch to ${protocolChain.name} to claim your refund.`
                : 'Connect a wallet holding this project’s claims to refund.'
              : 'You do not hold claim units in this project, so there is nothing to refund to you.'}
          </p>
        </div>
      )}

      {estimate !== null && estimate === 0n && balance > 0n ? (
        <p className="mt-space-sm flex items-start gap-1.5 font-mono text-label-sm text-warn">
          <Icon name="info" size={13} className="mt-0.5 shrink-0" />
          <span>Escrow balance is exhausted - every tranche was already released, so there is nothing left to refund.</span>
        </p>
      ) : null}

      {writeError ? (
        <p className="mt-space-sm font-mono text-label-sm text-error">{(writeError as Error).message}</p>
      ) : null}
      {notice ? (
        <p className="mt-space-sm font-mono text-label-sm text-primary">{notice}</p>
      ) : null}
      {txHash ? (
        <a
          href={protocolTxUrl(txHash) ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-space-sm flex items-center gap-1 font-mono text-label-sm text-primary hover:underline"
        >
          <Icon name="receipt_long" size={13} />
          {`${txHash.slice(0, 10)}…${txHash.slice(-8)}`}
        </a>
      ) : null}
    </section>
  );
}
