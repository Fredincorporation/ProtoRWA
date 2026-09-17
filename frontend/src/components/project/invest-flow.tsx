'use client';

import * as React from 'react';
import Link from 'next/link';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import { formatEthNumber, formatNumber, percentOf, weiToEthTrimmed } from '@/lib/format';
import { milestoneStatus, projectStatus } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { Project } from '@protorwa/shared';

/**
 * Commit capital (/projects/[slug]/invest).
 *
 * Ported from the design's invest flow: project summary, an amount entry with a
 * live cost breakdown, a risk acknowledgement gate, and a confirm step.
 *
 * The submitted call is built but not sent: there is no deployed registry and no
 * connected wallet in this demo, so the final button explains what would happen
 * rather than pretending to raise capital.
 */

export interface InvestFlowProps {
  project: Project;
  /** Whether a wallet is connected. */
  connected: boolean;
  /** Whether the chain has a deployed registry. */
  deployed: boolean;
}

export function InvestFlow({ project, connected, deployed }: InvestFlowProps) {
  const [units, setUnits] = React.useState('1000');
  const [acknowledged, setAcknowledged] = React.useState(false);

  const claimPrice = BigInt(project.claimPrice || '0');
  const available = BigInt(project.totalClaims) - BigInt(project.claimsCommitted);

  /** Number input as an integer; invalid input is treated as 0 for display. */
  const requested = React.useMemo(() => {
    const parsed = Number.parseInt(units, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [units]);

  const cost = claimPrice * BigInt(requested);
  const ownedAfter = BigInt(requested);

  const funded = percentOf(
    BigInt(project.escrow.totalCommitted || '0'),
    BigInt(project.escrow.target || '0'),
  );

  const exceedsAvailable = BigInt(requested) > available;
  const fundingOpen = project.status === 'FUNDING';

  const canSubmit =
    requested > 0 && !exceedsAvailable && fundingOpen && acknowledged && connected && deployed;

  const blockers: string[] = [];
  if (!fundingOpen) blockers.push('This project is not accepting capital.');
  if (requested === 0) blockers.push('Enter a number of claim units.');
  if (exceedsAvailable) blockers.push(`Only ${formatNumber(available)} units remain.`);
  if (!connected) blockers.push('Connect a wallet to commit.');
  if (!deployed) blockers.push('No registry is deployed on this network.');
  if (!acknowledged) blockers.push('Acknowledge the risk notice.');

  /** Preset amounts as a fraction of what remains. */
  const presets = [
    { label: '25%', value: Number(available) / 4 },
    { label: '50%', value: Number(available) / 2 },
    { label: 'Max', value: Number(available) },
  ];

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-space-lg px-space-lg py-space-lg lg:grid-cols-3 lg:px-margin">
      {/* Order form */}
      <div className="flex flex-col gap-space-lg lg:col-span-2">
        <section className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
          <h2 className="font-display text-headline-md text-on-surface">Commit capital</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Claims mint to your wallet on commit. Your capital goes into escrow,
            not to the founder, and is released only against approved milestones.
          </p>

          <div className="mt-space-md flex-col gap-space-sm">
            <label
              htmlFor="units"
              className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant"
            >
              Claim units
            </label>

            <div className="flex-wrap items-center gap-space-sm">
              <input
                id="units"
                type="number"
                min={1}
                max={Number(available)}
                step={1}
                value={units}
                onChange={(event) => setUnits(event.target.value)}
                aria-invalid={exceedsAvailable}
                className={cn(
                  'flex-1 rounded border-outline-variant/50 bg-surface-container-lowest px-space-sm py-3',
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
                    onClick={() => setUnits(String(Math.floor(preset.value)))}
                    className="rounded border-outline-variant/50 px-space-sm py-2 font-mono text-label-sm text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="font-mono text-label-sm text-outline">
              {formatNumber(available)} units available at{' '}
              {formatEthNumber(claimPrice, 4)} ETH each
            </p>
          </div>

          {/* Cost breakdown. Every figure is derived from the price, so it cannot
              disagree with the contract. */}
          <dl className="mt-space-md flex-col gap-space-xs rounded bg-surface-container-lowest p-space-sm font-mono text-label-sm">
            <div className="flex items-center justify-between">
              <dt className="text-on-surface-variant">
                {formatNumber(requested)} units × {formatEthNumber(claimPrice, 4)} ETH
              </dt>
              <dd className="tabular text-on-surface">{weiToEthTrimmed(cost, 6)} ETH</dd>
            </div>
            <div className="flex items-center justify-between border-t border-outline-variant/20 pt-1">
              <dt className="text-outline">Protocol fee on commitment</dt>
              <dd className="tabular text-outline">None</dd>
            </div>
            <div className="flex items-center justify-between border-t border-outline-variant/30 pt-1">
              <dt className="font-semibold text-on-surface">You send</dt>
              <dd className="tabular text-headline-sm text-primary">
                {weiToEthTrimmed(cost, 6)} ETH
              </dd>
            </div>
          </dl>

          {/* Risk acknowledgement. Deliberately required, not pre-checked. */}
          <label className="mt-space-md flex cursor-pointer items-start gap-space-sm rounded border-tertiary/40 bg-tertiary/5 p-space-sm">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-emerald-400"
            />
            <span className="text-body-sm text-on-surface-variant">
              I understand this is a claim on an unbuilt hardware product, that
              production can fail or ship late, that the contracts are unaudited,
              and that I may lose all capital I commit. I have read the{' '}
              <Link href="/faq#risks" className="text-primary underline">
                risk disclosure
              </Link>
              .
            </span>
          </label>

          <div className="mt-space-md flex-col gap-space-sm">
            <button
              type="button"
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
              className={cn(
                'inline-flex w-full items-center justify-center gap-2 rounded px-space-md py-3',
                'font-display text-headline-sm transition-colors',
                canSubmit
                  ? 'bg-primary text-on-primary hover:bg-primary-fixed'
                  : 'cursor-not-allowed border-dashed border-outline-variant/60 bg-surface-container-lowest text-outline',
              )}
            >
              <Icon name={canSubmit ? 'account_balance_wallet' : 'lock'} size={20} />
              {canSubmit ? 'Commit capital' : 'Cannot commit yet'}
            </button>

            {!canSubmit && blockers.length > 0 ? (
              <ul className="flex-col gap-1 rounded bg-surface-container-lowest p-space-sm font-mono text-label-sm text-on-surface-variant">
                {blockers.map((blocker) => (
                  <li key={blocker} className="flex items-start gap-1.5">
                    <Icon name="remove" size={13} className="mt-0.5 shrink-0 text-tertiary" />
                    {blocker}
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="font-mono text-label-sm text-outline">
              Demo environment: no transaction is broadcast, no wallet is charged,
              and no claim is minted.
            </p>
          </div>
        </section>

        {/* What you are buying. */}
        <section className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
          <h2 className="font-display text-headline-sm text-on-surface">
            What a claim entitles you to
          </h2>
          <ul className="mt-space-sm flex-col gap-space-sm text-body-sm text-on-surface-variant">
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

          <div className="mt-space-md border-t border-outline-variant/30 pt-space-sm">
            <h3 className="font-mono text-label-md uppercase tracking-wider text-tertiary">
              What it does not entitle you to
            </h3>
            <ul className="mt-2 flex-col gap-space-sm text-body-sm text-on-surface-variant">
              {[
                'Ownership, equity, dividends or governance rights in any company.',
                'A guaranteed delivery date, unit count or resale value.',
                'Priority over other holders in a liquidation.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Icon name="close" size={16} className="mt-0.5 shrink-0 text-error" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* Summary rail */}
      <aside className="flex flex-col gap-space-lg lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
          <div className="flex items-start justify-between gap-space-sm">
            <div>
              <Link
                href={`/projects/${project.slug}`}
                className="font-display text-headline-sm text-on-surface transition-colors hover:text-primary"
              >
                {project.title}
              </Link>
              <p className="mt-0.5 text-body-sm text-on-surface-variant">{project.tagline}</p>
            </div>
            <Badge tone={projectStatus(project.status).tone}>
              <StatusDot
                tone={project.status === 'FUNDING' ? 'brand' : 'neutral'}
                pulse={project.status === 'FUNDING'}
              />
              {projectStatus(project.status).label}
            </Badge>
          </div>

          <div className="mt-space-md">
            <div className="flex items-baseline justify-between font-mono text-label-sm">
              <span className="text-on-surface-variant">Raised</span>
              <span className="tabular text-primary">{funded.toFixed(1)}%</span>
            </div>
            <Progress value={funded} className="mt-1" />
            <div className="mt-1 font-mono text-label-sm text-outline">
              {weiToEthTrimmed(project.escrow.totalCommitted, 2)} /{' '}
              {weiToEthTrimmed(project.escrow.target, 2)} ETH
            </div>
          </div>

          {/* Position preview. */}
          <dl className="mt-space-md flex-col gap-space-xs border-t border-outline-variant/30 pt-space-sm font-mono text-label-sm">
            <div className="flex items-center justify-between">
              <dt className="text-outline">Your claim units after</dt>
              <dd className="tabular text-on-surface">{formatNumber(ownedAfter)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-outline">Your share of escrow</dt>
              <dd className="tabular text-on-surface">
                {percentOf(ownedAfter, BigInt(project.totalClaims)).toFixed(2)}%
              </dd>
            </div>
          </dl>
        </div>

        {/* Milestone schedule: what the capital is released against. */}
        <div className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
          <h2 className="font-mono text-label-md uppercase tracking-wider text-on-surface">
            Release schedule
          </h2>
          <ol className="mt-space-sm flex-col gap-space-xs">
            {project.milestones.map((milestone) => {
              const status = milestoneStatus(milestone.status);
              return (
                <li
                  key={milestone.index}
                  className="flex items-start justify-between gap-space-sm border-b border-outline-variant/20 pb-1.5 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-body-sm text-on-surface">
                      {milestone.title}
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-label-sm text-outline">
                      <StatusDot
                        tone={milestone.status === 'APPROVED' ? 'success' : 'neutral'}
                      />
                      {status.label}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-label-sm tabular text-secondary">
                    {weiToEthTrimmed(milestone.trancheAmount, 0)} ETH
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-space-sm font-mono text-label-sm text-outline">
            Each tranche releases only after holder approval of that
            milestone&apos;s evidence.
          </p>
        </div>
      </aside>
    </div>
  );
}
