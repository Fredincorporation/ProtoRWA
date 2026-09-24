'use client';

import * as React from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { SegmentedProgress } from '@/components/ui/progress';
import {
  demoViewer,
  mockLedger,
  mockPositions,
  mockProjects,
} from '@/lib/data/mock';
import {
  formatNumber,
  formatRelativeTime,
  shortenAddress,
  formatUsdgNumber,
  weiToGwei,
} from '@/lib/format';
import {
  COST_BASIS_METHOD,
  computeTaxSummary,
  ledgerToCsv,
  totalGasPaid,
} from '@/lib/tax/ledger';
import { cn } from '@/lib/utils';
import { protocolTxUrl } from '@protorwa/shared';
import type { LedgerEntry } from '@protorwa/shared';

/**
 * Account Activity, On-Chain Audit & Tax Ledger (/account/audit).
 *
 * Split from /account (which covers identity and positions) because the two
 * answer different questions. /account is "what do I hold and where did the
 * capital go"; this is "what did I transact, what did it cost, and what is the
 * resulting gain" - the screen you open with an accountant, or when reconciling
 * against a block explorer.
 *
 * The CSV export is generated client-side from the same ledger the table
 * renders, so the file cannot disagree with the screen.
 */

/** Ledger entry kind -> presentation. */
const ledgerKinds: Record<LedgerEntry['kind'], { label: string; icon: string; tone: string }> = {
  COMMIT: { label: 'Commit', icon: 'payments', tone: 'text-secondary' },
  CLAIM_MINT: { label: 'Claim minted', icon: 'token', tone: 'text-primary' },
  LISTING_CREATE: { label: 'Listing created', icon: 'sell', tone: 'text-on-surface' },
  LISTING_FILL: { label: 'Listing filled', icon: 'shopping_cart', tone: 'text-primary' },
  ORDER_FILL: { label: 'Order filled', icon: 'swap_horiz', tone: 'text-primary' },
  MILESTONE_RELEASE: { label: 'Tranche released', icon: 'lock_open', tone: 'text-secondary' },
  REFUND: { label: 'Refund', icon: 'currency_exchange', tone: 'text-on-surface' },
  VOTE_CAST: { label: 'Vote cast', icon: 'how_to_vote', tone: 'text-on-surface' },
  TRANSFER: { label: 'Transfer', icon: 'sync_alt', tone: 'text-on-surface' },
};

const FILTERS = ['all', 'capital', 'trades', 'governance'] as const;
type Filter = (typeof FILTERS)[number];

/** Which ledger kinds each filter admits. */
const filterKinds: Record<Filter, LedgerEntry['kind'][] | null> = {
  all: null,
  capital: ['COMMIT', 'CLAIM_MINT', 'MILESTONE_RELEASE', 'REFUND'],
  trades: ['LISTING_CREATE', 'LISTING_FILL', 'ORDER_FILL', 'TRANSFER'],
  governance: ['VOTE_CAST'],
};

/** Summary tiles for realized and open position. */
function TaxSummaryTiles() {
  const summary = React.useMemo(
    () => computeTaxSummary(mockPositions, mockLedger),
    [],
  );

  const gainTone =
    summary.realizedGain > 0n
      ? 'text-primary'
      : summary.realizedGain < 0n
        ? 'text-error'
        : 'text-on-surface';

  const tiles = [
    {
      label: 'Open cost basis',
      value: `${formatUsdgNumber(summary.openBasis, 4)} USDG`,
      sub: `${formatNumber(summary.openUnits)} units held`,
      tone: 'text-on-surface',
      icon: 'inventory',
    },
    {
      label: 'Realized proceeds',
      value: `${formatUsdgNumber(summary.realizedProceeds, 4)} USDG`,
      sub: `${summary.disposals.length} disposal${summary.disposals.length === 1 ? '' : 's'}`,
      tone: 'text-on-surface',
      icon: 'sell',
    },
    {
      label: 'Realized gain / loss',
      value: `${summary.realizedGain < 0n ? '−' : ''}${formatUsdgNumber(
        summary.realizedGain < 0n ? -summary.realizedGain : summary.realizedGain,
        4,
      )} USDG`,
      sub: `${COST_BASIS_METHOD} cost basis`,
      tone: gainTone,
      icon: 'trending_up',
    },
    {
      label: 'Gas paid (all time)',
      value: `${weiToGwei(totalGasPaid(mockLedger))} gwei`,
      sub: 'Recoverable as a cost in some regimes',
      tone: 'text-on-surface',
      icon: 'local_gas_station',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex flex-col justify-between gap-space-sm rounded-lg border-outline-variant/40 bg-surface-container p-space-md"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-label-sm uppercase tracking-wider text-outline">
              {tile.label}
            </span>
            <Icon name={tile.icon} size={16} className="text-outline" />
          </div>
          <span className={cn('font-display text-headline-md tabular', tile.tone)}>{tile.value}</span>
          <span className="font-mono text-label-sm text-outline">{tile.sub}</span>
        </div>
      ))}
    </div>
  );
}

/** Short vs long term split, using the weighted holding period per disposal. */
function HoldingPeriodSplit() {
  const summary = React.useMemo(() => computeTaxSummary(mockPositions, mockLedger), []);

  const short = summary.shortTermGain;
  const long = summary.longTermGain;
  const total = summary.realizedGain;

  if (total === 0n && summary.disposals.length === 0) {
    return (
      <section className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
        <h2 className="font-display text-headline-sm text-on-surface">Holding period</h2>
        <p className="mt-space-sm font-mono text-label-sm text-outline">
          No disposals recorded, so there is nothing to split between short and long
          term. Every open lot is still held.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="font-display text-headline-sm text-on-surface">Holding period</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Gains split by how long each lot was held before disposal. Lots are consumed{' '}
          {COST_BASIS_METHOD}, and the holding period is weighted across the lots a
          disposal actually consumed.
        </p>
      </div>

      <div className="flex flex-col gap-space-md p-space-md">
        <SegmentedProgress
          total={100}
          segments={[
            {
              value: Math.abs(Number(short)) || 0.0001,
              className: 'bg-tertiary',
              label: `Short term (≤365d) ${formatUsdgNumber(short < 0n ? -short : short, 4)} USDG`,
            },
            {
              value: Math.abs(Number(long)) || 0.0001,
              className: 'bg-primary',
              label: `Long term (>365d) ${formatUsdgNumber(long < 0n ? -long : long, 4)} USDG`,
            },
          ]}
        />

        <dl className="grid grid-cols-1 gap-space-sm font-mono text-label-sm sm:grid-cols-3">
          <div className="rounded bg-surface-container-lowest p-space-sm">
            <dt className="text-outline">Short-term gain</dt>
            <dd
              className={cn(
                'tabular',
                short > 0n ? 'text-primary' : short < 0n ? 'text-error' : 'text-on-surface',
              )}
            >
              {short < 0n ? '−' : ''}
              {formatUsdgNumber(short < 0n ? -short : short, 4)} USDG
            </dd>
          </div>
          <div className="rounded bg-surface-container-lowest p-space-sm">
            <dt className="text-outline">Long-term gain</dt>
            <dd
              className={cn(
                'tabular',
                long > 0n ? 'text-primary' : long < 0n ? 'text-error' : 'text-on-surface',
              )}
            >
              {long < 0n ? '−' : ''}
              {formatUsdgNumber(long < 0n ? -long : long, 4)} USDG
            </dd>
          </div>
          <div className="rounded bg-surface-container-lowest p-space-sm">
            <dt className="text-outline">Realized basis</dt>
            <dd className="tabular text-on-surface">
              {formatUsdgNumber(summary.realizedBasis, 4)} USDG
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** Open tax lots: what is still held, at what cost, since when. */
function OpenLots() {
  const summary = React.useMemo(() => computeTaxSummary(mockPositions, mockLedger), []);

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="font-display text-headline-sm text-on-surface">Open tax lots</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Each acquisition, what remains of it, and how long it has been held. These
          are the units a future disposal would draw from first.
        </p>
      </div>

      {summary.openLots.length === 0 ? (
        <p className="px-space-md py-space-lg text-center font-mono text-label-sm text-outline">
          No open lots.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <caption className="sr-only">
              Open tax lots, with acquisition date, units remaining, cost per unit and
              holding period.
            </caption>
            <thead>
              <tr className="bg-surface-container-low font-mono text-label-sm uppercase tracking-wider text-outline">
                <th scope="col" className="px-space-md py-2">Project</th>
                <th scope="col" className="px-space-md py-2">Acquired</th>
                <th scope="col" className="px-space-md py-2 text-right">Units left</th>
                <th scope="col" className="px-space-md py-2 text-right">Cost / unit</th>
                <th scope="col" className="px-space-md py-2 text-right">Basis</th>
                <th scope="col" className="px-space-md py-2 text-right">Held</th>
              </tr>
            </thead>
            <tbody>
              {summary.openLots.map((lot, index) => {
                const project = mockProjects.find((p) => p.id === lot.projectId);
                const heldDays = Math.round(
                  (Date.now() - new Date(lot.acquiredAt).getTime()) / 86_400_000,
                );
                const longTerm = heldDays > 365;

                return (
                  <tr
                    key={`${lot.projectId}-${index}`}
                    className="border-t border-outline-variant/20"
                  >
                    <th scope="row" className="px-space-md py-3 text-left font-medium text-on-surface">
                      {project?.title ?? 'Unknown'}
                    </th>
                    <td className="px-space-md py-3 font-mono text-label-sm text-on-surface-variant">
                      {new Date(lot.acquiredAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-space-md py-3 text-right font-mono tabular text-on-surface">
                      {formatNumber(lot.remaining)}
                    </td>
                    <td className="px-space-md py-3 text-right font-mono tabular text-on-surface-variant">
                      {formatUsdgNumber(lot.costPerUnit, 6)} USDG
                    </td>
                    <td className="px-space-md py-3 text-right font-mono tabular text-on-surface">
                      {formatUsdgNumber(lot.remaining * lot.costPerUnit, 4)} USDG
                    </td>
                    <td className="px-space-md py-3 text-right">
                      <span
                        className={cn(
                          'font-mono text-label-sm',
                          longTerm ? 'text-primary' : 'text-tertiary',
                        )}
                      >
                        {heldDays}d {longTerm ? '· long' : '· short'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Realized disposals with FIFO-matched basis. */
function Disposals() {
  const summary = React.useMemo(() => computeTaxSummary(mockPositions, mockLedger), []);

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="font-display text-headline-sm text-on-surface">Realized disposals</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Sales matched against acquisitions using {COST_BASIS_METHOD}. The basis shown
          is the cost of the specific lots consumed, not an average.
        </p>
      </div>

      {summary.disposals.length === 0 ? (
        <p className="px-space-md py-space-lg text-center font-mono text-label-sm text-outline">
          No disposals recorded. Nothing has been sold or transferred out.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <caption className="sr-only">
              Realized disposals showing proceeds, FIFO cost basis, gain and holding
              period.
            </caption>
            <thead>
              <tr className="bg-surface-container-low font-mono text-label-sm uppercase tracking-wider text-outline">
                <th scope="col" className="px-space-md py-2">Disposed</th>
                <th scope="col" className="px-space-md py-2 text-right">Units</th>
                <th scope="col" className="px-space-md py-2 text-right">Proceeds</th>
                <th scope="col" className="px-space-md py-2 text-right">Basis</th>
                <th scope="col" className="px-space-md py-2 text-right">Gain / loss</th>
                <th scope="col" className="px-space-md py-2 text-right">Held</th>
              </tr>
            </thead>
            <tbody>
              {summary.disposals.map((disposal, index) => {
                const project = mockProjects.find((p) => p.id === disposal.projectId);
                const gain = disposal.gain;
                return (
                  <tr key={index} className="border-t border-outline-variant/20">
                    <th scope="row" className="px-space-md py-3 text-left">
                      <div className="font-medium text-on-surface">{project?.title ?? 'Unknown'}</div>
                      <div className="font-mono text-label-sm text-outline">
                        {new Date(disposal.disposedAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                    </th>
                    <td className="px-space-md py-3 text-right font-mono tabular text-on-surface">
                      {formatNumber(disposal.units)}
                    </td>
                    <td className="px-space-md py-3 text-right font-mono tabular text-on-surface-variant">
                      {formatUsdgNumber(disposal.proceeds, 4)} USDG
                    </td>
                    <td className="px-space-md py-3 text-right font-mono tabular text-on-surface-variant">
                      {formatUsdgNumber(disposal.basis, 4)} USDG
                    </td>
                    <td
                      className={cn(
                        'px-space-md py-3 text-right font-mono tabular font-semibold',
                        gain > 0n ? 'text-primary' : gain < 0n ? 'text-error' : 'text-on-surface',
                      )}
                    >
                      {gain < 0n ? '−' : '+'}
                      {formatUsdgNumber(gain < 0n ? -gain : gain, 4)} USDG
                    </td>
                    <td className="px-space-md py-3 text-right font-mono text-label-sm text-outline">
                      {disposal.holdingDays}d
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** The full activity ledger, filterable, with the CSV export. */
function ActivityLedger() {
  const [filter, setFilter] = React.useState<Filter>('all');
  const [exported, setExported] = React.useState(false);

  const entries = React.useMemo(() => {
    const kinds = filterKinds[filter];
    return [...mockLedger]
      .filter((entry) => (kinds ? kinds.includes(entry.kind) : true))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [filter]);

  /**
   * Export is generated from the same array the table renders, so the file and
   * the screen cannot drift. `URL.revokeObjectURL` matters here: without it the
   * blob stays alive for the lifetime of the document.
   */
  const onExport = React.useCallback(() => {
    const csv = ledgerToCsv(mockLedger, mockProjects);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `protorwa-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExported(true);
  }, []);

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="flex flex-wrap items-center justify-between gap-space-sm border-b border-outline-variant/40 px-space-md py-space-sm">
        <div>
          <h2 className="font-display text-headline-sm text-on-surface">Activity ledger</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Every transaction that moved this position, with the gas paid.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-space-sm">
          <div className="flex items-center rounded bg-surface-container-lowest p-0.5">
            {FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                aria-pressed={filter === option}
                className={cn(
                  'rounded px-2 py-1 font-mono text-label-sm uppercase transition-colors',
                  filter === option
                    ? 'bg-primary font-semibold text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                {option}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-1.5 rounded border-primary/40 bg-primary/10 px-space-sm py-1.5 font-mono text-label-sm text-primary transition-colors hover:bg-primary/20"
          >
            <Icon name={exported ? 'check' : 'download'} size={14} />
            {exported ? 'Exported' : 'Export CSV'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-body-sm">
          <caption className="sr-only">
            Account activity ledger: action, project, signed claim and value movements,
            gas paid and transaction hash.
          </caption>
          <thead>
            <tr className="bg-surface-container-low font-mono text-label-sm uppercase tracking-wider text-outline">
              <th scope="col" className="px-space-md py-2">Action</th>
              <th scope="col" className="px-space-md py-2">Project</th>
              <th scope="col" className="px-space-md py-2 text-right">Claims</th>
              <th scope="col" className="px-space-md py-2 text-right">Value</th>
              <th scope="col" className="px-space-md py-2 text-right">Gas</th>
              <th scope="col" className="px-space-md py-2">Tx</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-space-md py-space-lg text-center font-mono text-label-sm text-outline">
                  No entries match this filter.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const kind = ledgerKinds[entry.kind];
                const project = mockProjects.find((p) => p.id === entry.projectId);
                const claimAmount = BigInt(entry.amount || '0');
                const value = BigInt(entry.value || '0');

                return (
                  <tr key={entry.id} className="border-t border-outline-variant/20 hover:bg-surface-container-high">
                    <th scope="row" className="px-space-md py-3 text-left">
                      <div className="flex items-center gap-2">
                        <Icon name={kind.icon} size={16} className={kind.tone} />
                        <div>
                          <div className="font-medium text-on-surface">{kind.label}</div>
                          <div className="font-mono text-label-sm text-outline">
                            {formatRelativeTime(entry.timestamp)}
                          </div>
                        </div>
                      </div>
                    </th>
                    <td className="px-space-md py-3 text-on-surface-variant">
                      {project?.title ?? '—'}
                    </td>
                    <td className="px-space-md py-3 text-right font-mono tabular">
                      {claimAmount === 0n ? (
                        <span className="text-outline">—</span>
                      ) : (
                        <span className={claimAmount < 0n ? 'text-error' : 'text-primary'}>
                          {claimAmount > 0n ? '+' : ''}
                          {formatNumber(claimAmount)}
                        </span>
                      )}
                    </td>
                    <td className="px-space-md py-3 text-right font-mono tabular">
                      {value === 0n ? (
                        <span className="text-outline">—</span>
                      ) : (
                        <span className={value < 0n ? 'text-error' : 'text-primary'}>
                          {value > 0n ? '+' : '−'}
                          {formatUsdgNumber(value < 0n ? -value : value, 4)} USDG
                        </span>
                      )}
                    </td>
                    <td className="px-space-md py-3 text-right font-mono text-label-sm tabular text-outline">
                      {weiToGwei(entry.gasPaid)} gwei
                    </td>
                    <td className="px-space-md py-3">
                      <a
                        href={protocolTxUrl(entry.txHash) ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-label-sm text-on-surface-variant transition-colors hover:text-primary"
                      >
                        {entry.txHash.slice(0, 10)}…
                        <Icon name="open_in_new" size={11} />
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-space-sm border-t border-outline-variant/40 p-space-sm">
        <Icon name="info" size={16} className="shrink-0 text-outline" />
        <p className="font-mono text-label-sm text-outline">
          Demo ledger: hashes are synthetic and will not resolve on the explorer. The CSV
          export is generated from the rows above.
        </p>
      </div>
    </section>
  );
}

/** Wallet-aware header strip: states whose account this is. */
function AccountStrip() {
  const { address, isConnected } = useAccount();

  return (
    <div className="flex flex-wrap items-center justify-between gap-space-sm rounded-lg border-outline-variant/40 bg-surface-container-low p-space-md">
      <div className="flex items-center gap-space-sm">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="manage_search" size={20} />
        </span>
        <div className="flex flex-col">
          <span className="font-mono text-label-md font-bold text-on-surface">
            {isConnected && address ? shortenAddress(address, 6) : shortenAddress(demoViewer.address, 6)}
          </span>
          <span className="font-mono text-label-sm text-outline">
            {isConnected
              ? 'Connected wallet — ledger below is the demo set'
              : `Not connected — showing demo account ${demoViewer.handle}`}
          </span>
        </div>
      </div>

      <Badge tone={isConnected ? 'brand' : 'neutral'}>
        <StatusDot tone={isConnected ? 'brand' : 'neutral'} pulse={isConnected} />
        {isConnected ? 'Live wallet' : 'Demo viewer'}
      </Badge>
    </div>
  );
}

export default function AccountAuditPage() {
  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <nav
            aria-label="Breadcrumb"
            className="mb-space-sm flex items-center gap-1.5 font-mono text-label-sm text-outline"
          >
            <Link href="/account" className="transition-colors hover:text-primary">
              Account
            </Link>
            <Icon name="chevron_right" size={14} />
            <span className="text-on-surface">Activity &amp; Audit</span>
          </nav>
          <h1 className="font-display text-headline-lg tracking-tight text-on-surface">
            On-Chain Activity, Audit &amp; Tax Ledger
          </h1>
          <p className="mt-2 max-w-3xl text-body-md text-on-surface-variant">
            Every transaction that moved a position, its gas cost, and the resulting
            realized gain — with the acquisition lots each disposal was matched
            against.
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-space-lg px-space-lg py-space-lg lg:px-margin">
        <AccountStrip />
        <TaxSummaryTiles />

        <div className="grid grid-cols-1 gap-space-lg lg:grid-cols-3">
          <div className="flex flex-col gap-space-lg lg:col-span-2">
            <ActivityLedger />
            <Disposals />
          </div>

          <div className="flex flex-col gap-space-lg">
            <HoldingPeriodSplit />
            <OpenLots />

            {/*
              The disclaimer is not decoration. These figures come from a
              synthetic ledger and a FIFO assumption; presenting them as a filing
              would be actively harmful.
            */}
            <section className="rounded-lg border-tertiary/30 bg-surface-container-low p-space-md">
              <div className="mb-space-sm flex items-center gap-1.5 font-mono text-label-sm uppercase tracking-wider text-tertiary">
                <Icon name="warning" size={14} />
                Not tax advice
              </div>
              <p className="text-body-sm text-on-surface-variant">
                Cost basis is computed {COST_BASIS_METHOD} against a synthetic demo
                ledger. Real reporting depends on your jurisdiction&apos;s rules, the
                complete on-chain history, and the specific-identification elections
                available to you. Reconcile against a block explorer and consult an
                accountant before filing.
              </p>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
