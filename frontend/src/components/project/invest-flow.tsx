'use client';

import * as React from 'react';
import Link from 'next/link';
import { erc20Abi } from 'viem';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { protocolChain } from '@/lib/wagmi';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import { formatNumber, percentOf } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  SETTLEMENT_CURRENCIES,
  formatSettlementNumber,
  getChain,
  getContracts,
  protocolAddressUrl,
  protocolTxUrl,
  projectRegistryAbi,
  type SettlementCurrencyId,
} from '@protorwa/shared';
import type { Project } from '@protorwa/shared';

export interface InvestFlowProps {
  project: Project;
  /** Whether a wallet is connected. */
  connected: boolean;
  /** Whether the chain has a deployed registry. */
  deployed: boolean;
}

/**
 * Registry address for the chain the protocol is deployed on.
 *
 * Resolved from the same chain registry the rest of the app uses, so a
 * commitment is always addressed to the contract on the chain the wallet is
 * connected to rather than a stale hardcoded address.
 */
const REGISTRY_ADDRESS = (getContracts(protocolChain.id).projectRegistry ??
  '0x0000000000000000000000000000000000000000') as `0x${string}`;

/**
 * Resolve the numeric on-chain project id from the project record.
 *
 * The slug -> id mapping now lives in the data layer (each live project carries
 * `onChainProjectId`), so the app has a single source of truth shared with the
 * market terminal. An unmapped project is refused rather than guessed, because
 * guessing sends capital to an arbitrary project's escrow.
 */
function resolveOnChainProjectId(project: Project): bigint | undefined {
  if (!project.onChainProjectId) {
    console.error(
      `[invest] project "${project.slug}" has no onChainProjectId set; refusing to commit. ` +
        'Seed it on the deployment and add its id to the data layer.',
    );
    return undefined;
  }
  try {
    return BigInt(project.onChainProjectId);
  } catch {
    console.error(`[invest] invalid onChainProjectId "${project.onChainProjectId}".`);
    return undefined;
  }
}

export function InvestFlow({ project, connected, deployed }: InvestFlowProps) {
  const [units, setUnits] = React.useState('10');
  const [acknowledged, setAcknowledged] = React.useState(false);
  /**
   * Settlement asset. The deployed escrow is USDG-denominated, so this defaults
   * to USDG rather than ETH - quoting in ETH against a USDG escrow would show a
   * price 10^12 times too large.
   */
  const [currency] = React.useState<SettlementCurrencyId>('USDG');

  // On-chain commitment via wagmi
  const {
    writeContract,
    data: txHash,
    isPending: isSubmitting,
    error: writeError,
    reset: resetTx,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const { address } = useAccount();

  /**
   * USDG token for the protocol chain. `commit` is an ERC-20 pull
   * (`paymentToken.safeTransferFrom`), so the registry needs an allowance before
   * it can move the backer's capital - there is no native value to send.
   */
  const usdgAddress = getChain(protocolChain.id)?.usdg as `0x${string}` | undefined;
  const [commitStep, setCommitStep] = React.useState<'idle' | 'approving' | 'committing'>('idle');

  const allowance = useReadContract({
    address: usdgAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, REGISTRY_ADDRESS] : undefined,
    chainId: protocolChain.id,
    query: { enabled: Boolean(address && usdgAddress) },
  });

  /** True once the *commitment* (not the approval) has been mined. */
  const commitDone = commitStep === 'committing' && isConfirmed;

  /*
   * Fallback claim price, in USDG base units (6 decimals).
   *
   * The previous fallback was 50000000000000 wei - an 18-decimal ETH figure. The
   * deployed escrow is USDG-denominated, where 1 USDG is 1000000 base units, so
   * that fallback was off by a factor of 10^12 and would have quoted a price
   * roughly a million times the intended amount.
   *
   * 1000000n = 1.00 USDG per claim.
   */
  const claimPrice = BigInt(project.claimPrice || '1000000');
  const available = BigInt(project.totalClaims) - BigInt(project.claimsCommitted);

  /** The settlement asset, read from the chain rather than assumed. */
  const activeCurrency = SETTLEMENT_CURRENCIES[currency];

  /** Number input as an integer; invalid input is treated as 0 for display. */
  const requested = React.useMemo(() => {
    const parsed = Number.parseInt(units, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [units]);

  const cost = claimPrice * BigInt(requested);
  const funded = percentOf(
    BigInt(project.escrow.totalCommitted || '0'),
    BigInt(project.escrow.target || '0'),
  );

  const exceedsAvailable = BigInt(requested) > available;
  const fundingOpen = project.status === 'FUNDING';

  const isBusy = isSubmitting || isConfirming || commitStep !== 'idle';

  const canSubmit =
    requested > 0 &&
    !exceedsAvailable &&
    fundingOpen &&
    acknowledged &&
    connected &&
    deployed &&
    !isBusy &&
    !commitDone;

  const blockers: string[] = [];
  if (!fundingOpen) blockers.push('This project is not accepting capital.');
  if (requested === 0) blockers.push('Enter a number of claim units.');
  if (exceedsAvailable) blockers.push(`Only ${formatNumber(available)} units remain.`);
  if (!connected) blockers.push(`Connect your ${protocolChain.name} wallet to commit.`);
  if (!deployed) blockers.push('No registry is deployed on this network.');
  if (!acknowledged) blockers.push('Acknowledge the risk notice.');

  /** Sends the on-chain `commit`, pulling `cost` USDG via the registry allowance. */
  const doCommit = (onChainProjectId: bigint) => {
    setCommitStep('committing');
    writeContract({
      address: REGISTRY_ADDRESS,
      abi: projectRegistryAbi,
      functionName: 'commit',
      args: [onChainProjectId, BigInt(requested)],
      /*
       * USDG settlement means no native value is sent. The escrow is
       * ERC-20-denominated, so the registry pulls the token via an allowance and
       * `commit` rejects any `msg.value != 0` outright.
       */
      value: 0n,
      chainId: protocolChain.id,
    });
  };

  const handleCommit = () => {
    if (!canSubmit || !usdgAddress) return;
    resetTx();

    const onChainProjectId = resolveOnChainProjectId(project);
    if (onChainProjectId === undefined) {
      // The resolver already logged why; do not send capital to an arbitrary project.
      return;
    }

    // `commit` is an ERC-20 pull: top up the registry's allowance first when it
    // is short, then chain the commit once the approval confirms.
    const approved = allowance.data ?? 0n;
    if (approved < cost) {
      setCommitStep('approving');
      writeContract({
        address: usdgAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [REGISTRY_ADDRESS, cost],
        chainId: protocolChain.id,
      });
    } else {
      doCommit(onChainProjectId);
    }
  };

  /* After the approval lands, fire the commit; after the commit lands, settle. */
  React.useEffect(() => {
    if (!isConfirmed) return;
    if (commitStep === 'approving') {
      const pid = resolveOnChainProjectId(project);
      allowance.refetch();
      if (pid !== undefined) doCommit(pid);
    } else if (commitStep === 'committing') {
      // Leave commitStep 'committing' so commitDone renders the success card.
    }
  }, [isConfirmed]);

  /** Preset amounts as a fraction of what remains. */
  const presets = [
    { label: '10', value: 10 },
    { label: '50', value: 50 },
    { label: '100', value: 100 },
  ];

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-space-lg px-space-lg py-space-lg lg:grid-cols-3 lg:px-margin">
      {/* Order form */}
      <div className="flex flex-col gap-space-lg lg:col-span-2">
        <section className="rounded-lg border border-outline-variant/40 bg-surface-container p-space-md">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-headline-md text-on-surface">Commit capital</h2>
            <Badge tone="info" className="font-mono text-label-xs">
              <Icon name="verified" size={12} className="mr-1" />
              {activeCurrency.symbol} on {protocolChain.name}
            </Badge>
          </div>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Claims mint directly as ERC-1155 tokens to your wallet. Your capital is deposited into{' '}
            <code className="rounded bg-surface-container-lowest px-1 text-primary">MilestoneEscrow.sol</code>{' '}
            and released tranche-by-tranche based on backer vote consensus.
          </p>

          <div className="mt-space-md flex flex-col gap-space-sm">
            <label
              htmlFor="units"
              className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant"
            >
              Claim units
            </label>

            <div className="flex flex-wrap items-center gap-space-sm">
              <input
                id="units"
                type="number"
                min={1}
                max={Number(available)}
                step={1}
                value={units}
                disabled={isBusy || isConfirmed}
                onChange={(event) => setUnits(event.target.value)}
                aria-invalid={exceedsAvailable}
                className={cn(
                  'flex-1 rounded border border-outline-variant/50 bg-surface-container-lowest px-space-sm py-3',
                  'font-mono text-headline-sm tabular text-on-surface focus:outline-none',
                  'focus:border-primary/60',
                  exceedsAvailable && 'border-error/60',
                )}
              />

              <div className="flex items-center gap-1">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={isBusy || isConfirmed}
                    onClick={() => setUnits(String(preset.value))}
                    className="rounded border border-outline-variant/50 px-space-sm py-2 font-mono text-label-sm text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="font-mono text-label-sm text-outline">
              Available: {formatNumber(available)} / {formatNumber(project.totalClaims)} units
            </p>
          </div>

          {/* Pricing breakdown */}
          <dl className="mt-space-md flex flex-col gap-space-xs rounded bg-surface-container-lowest p-space-md font-mono text-label-md">
            <div className="flex items-center justify-between">
              <dt className="text-on-surface-variant">Price per claim</dt>
              <dd className="tabular text-on-surface">
                {formatSettlementNumber(claimPrice, currency, 2)} {activeCurrency.symbol}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-on-surface-variant">Committed claims</dt>
              <dd className="tabular text-on-surface">{formatNumber(requested)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-outline-variant/30 pt-2">
              <dt className="font-semibold text-on-surface">Total commitment</dt>
              <dd className="tabular text-headline-sm text-primary">
                {formatSettlementNumber(cost, currency, 2)} {activeCurrency.symbol}
              </dd>
            </div>
          </dl>

          {/* Risk acknowledgement */}
          <label className="mt-space-md flex cursor-pointer items-start gap-space-sm rounded border border-tertiary/40 bg-tertiary/5 p-space-sm">
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={isBusy || isConfirmed}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-emerald-400"
            />
            <span className="text-body-sm text-on-surface-variant">
              I understand this is a live testnet transaction on {protocolChain.name}. The capital is
              deposited into on-chain escrow custody and claims will be minted to my address. I have
              read the{' '}
              <Link href="/faq#risks" className="text-primary underline">
                risk disclosure
              </Link>
              .
            </span>
          </label>

          {/* Action button & Status */}
          <div className="mt-space-md flex flex-col gap-space-sm">
            {commitDone ? (
              <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/10 p-space-md">
                <div className="flex items-center gap-2 text-primary font-mono text-title-sm">
                  <Icon name="check_circle" size={20} />
                  <span>Commitment confirmed on {protocolChain.name}!</span>
                </div>
                <p className="text-body-sm text-on-surface-variant">
                  Your ERC-1155 ClaimTokens have been minted and your capital is locked in MilestoneEscrow.
                </p>
                {txHash && (
                  <a
                    href={protocolTxUrl(txHash) ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-label-sm text-primary underline"
                  >
                    <span>View Transaction on Explorer</span>
                    <Icon name="open_in_new" size={14} />
                  </a>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleCommit}
                disabled={!canSubmit}
                aria-disabled={!canSubmit}
                className={cn(
                  'inline-flex w-full items-center justify-center gap-2 rounded px-space-md py-3',
                  'font-display text-headline-sm transition-colors',
                  canSubmit
                    ? 'bg-primary text-on-primary hover:bg-primary-fixed cursor-pointer'
                    : isBusy
                    ? 'bg-primary/60 text-on-primary cursor-wait'
                    : 'cursor-not-allowed border-dashed border border-outline-variant/60 bg-surface-container-lowest text-outline',
                )}
              >
                <Icon
                  name={isBusy ? 'pending' : canSubmit ? 'account_balance_wallet' : 'lock'}
                  size={20}
                  className={isBusy ? 'animate-spin' : ''}
                />
                {isSubmitting
                  ? commitStep === 'approving'
                    ? 'Approving USDG in wallet…'
                    : 'Confirming in wallet…'
                  : isConfirming
                  ? commitStep === 'approving'
                    ? 'Mining USDG approval…'
                    : `Mining on ${protocolChain.name}…`
                  : canSubmit
                  ? `Commit ${formatSettlementNumber(cost, currency, 2)} ${activeCurrency.symbol} on-chain`
                  : 'Cannot commit yet'}
              </button>
            )}

            {/* Error messaging */}
            {(writeError || receiptError) && (
              <div className="flex items-start gap-2 rounded bg-error/10 p-space-sm text-error font-mono text-label-sm">
                <Icon name="error" size={16} className="shrink-0 mt-0.5" />
                <span>
                  {writeError?.message?.includes('User rejected')
                    ? 'Transaction was cancelled in wallet.'
                    : writeError?.message || receiptError?.message || 'Transaction failed.'}
                </span>
              </div>
            )}

            {!canSubmit && !isBusy && !commitDone && blockers.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded bg-surface-container-lowest p-space-sm font-mono text-label-sm text-on-surface-variant">
                {blockers.map((blocker) => (
                  <li key={blocker} className="flex items-start gap-1.5">
                    <Icon name="remove" size={13} className="mt-0.5 shrink-0 text-tertiary" />
                    {blocker}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex items-center justify-between font-mono text-label-xs text-outline">
              <span>
                {protocolChain.name} (Chain ID: {protocolChain.id})
              </span>
              <a
                href={protocolAddressUrl(REGISTRY_ADDRESS) ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary underline flex items-center gap-0.5"
              >
                Registry on Explorer
                <Icon name="open_in_new" size={11} />
              </a>
            </div>
          </div>
        </section>

        {/* What you are buying */}
        <section className="rounded-lg border border-outline-variant/40 bg-surface-container p-space-md">
          <h2 className="font-display text-headline-sm text-on-surface">
            What a claim entitles you to
          </h2>
          <ul className="mt-space-sm flex flex-col gap-space-sm text-body-sm text-on-surface-variant">
            {[
              'A vote on every milestone release, weighted by the balance snapshotted when evidence is submitted.',
              'A pro-rata refund from remaining escrow if the project is cancelled or defaults.',
              'The ability to list the claim on the secondary market at any time.',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Icon name="check" size={16} className="mt-0.5 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Summary rail */}
      <aside className="flex flex-col gap-space-lg lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-lg border border-outline-variant/40 bg-surface-container p-space-md">
          <div className="flex items-start justify-between gap-space-sm">
            <div>
              <Link
                href={`/projects/${project.slug}`}
                className="font-display text-headline-sm text-on-surface hover:text-primary transition-colors"
              >
                {project.title}
              </Link>
              <p className="font-mono text-label-sm text-outline">{project.category}</p>
            </div>
            <Badge tone="brand">
              <StatusDot tone="brand" />
              {project.status}
            </Badge>
          </div>

          <div className="mt-space-md flex flex-col gap-space-xs font-mono text-label-sm">
            <div className="flex justify-between text-on-surface-variant">
              <span>Target raise</span>
              <span className="text-on-surface">
                {formatSettlementNumber(project.escrow.target, currency, 2)} {activeCurrency.symbol}
              </span>
            </div>
            <div className="flex justify-between text-on-surface-variant">
              <span>Committed so far</span>
              <span className="text-on-surface">
                {formatSettlementNumber(project.escrow.totalCommitted, currency, 2)}{' '}
                {activeCurrency.symbol}
              </span>
            </div>
            <div className="flex justify-between text-on-surface-variant">
              <span>Milestones</span>
              <span className="text-on-surface">{project.milestones.length} tranches</span>
            </div>
          </div>

          <div className="mt-space-md border-t border-outline-variant/30 pt-space-sm">
            <div className="flex justify-between font-mono text-label-xs text-outline mb-1">
              <span>Progress</span>
              <span>{funded.toFixed(1)}%</span>
            </div>
            <Progress value={funded} />
          </div>
        </div>
      </aside>
    </div>
  );
}
