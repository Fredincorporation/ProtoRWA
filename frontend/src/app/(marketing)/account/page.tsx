import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import {
  demoViewer,
  mockLedger,
  mockPositions,
  mockProjects,
} from '@/lib/data/mock';
import {
  formatRelativeTime,
  formatNumber,
  percentOf,
  shortenAddress,
  weiToEthTrimmed,
  weiToGwei,
} from '@/lib/format';
import { projectStatus } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { LedgerEntry } from '@protorwa/shared';

export const metadata: Metadata = {
  title: 'Account',
  description:
    'Your claim positions, committed capital, escrow exposure and on-chain activity ledger.',
};

/**
 * Account / portfolio (/account).
 *
 * Ported from the design's "User Account Settings & On-Chain Audit Ledger":
 * identity panel, position list, exposure summary and a transaction ledger.
 *
 * The viewer is not authenticated in this demo, so the identity panel says so and
 * the positions are the demo viewer's seeded holdings rather than a real wallet's.
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

function IdentityPanel() {
  const address = demoViewer.address;

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
      <div className="flex items-center gap-space-md">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-container font-display text-headline-sm text-on-primary-container">
          {address.slice(2, 4).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="font-display text-headline-sm text-on-surface">
            {demoViewer.handle}
          </div>
          <div className="truncate font-mono text-label-sm text-outline">
            {shortenAddress(address, 6)}
          </div>
        </div>
      </div>

      <dl className="mt-space-md flex-col gap-space-xs border-t border-outline-variant/30 pt-space-sm font-mono text-label-sm">
        <div className="flex items-center justify-between">
          <dt className="text-outline">Role</dt>
          <dd className="text-on-surface">Claim holder</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-outline">Protocol admin</dt>
          <dd className="text-on-surface-variant">No</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-outline">Sign-in method</dt>
          <dd className="text-on-surface-variant">Wallet (SIWE)</dd>
        </div>
      </dl>

      <div className="mt-space-md flex-wrap items-center gap-space-sm rounded bg-surface-container-lowest p-space-sm">
        <Icon name="info" size={16} className="shrink-0 text-outline" />
        <p className="font-mono text-label-sm text-on-surface-variant">
          Demonstration data. No wallet is connected, so these holdings belong to a
          seeded demo address rather than to you.
        </p>
      </div>
    </section>
  );
}

/** Exposure summary across all positions. */
function ExposureSummary() {
  const totals = mockPositions.reduce(
    (acc, position) => ({
      committed: acc.committed + BigInt(position.committed || '0'),
      released: acc.released + BigInt(position.released || '0'),
      refunded: acc.refunded + BigInt(position.refunded || '0'),
      units: acc.units + BigInt(position.amount || '0'),
    }),
    { committed: 0n, released: 0n, refunded: 0n, units: 0n },
  );

  const stillAtRisk = totals.committed - totals.released - totals.refunded;

  const tiles = [
    { label: 'Committed', value: `${weiToEthTrimmed(totals.committed, 2)} ETH`, tone: 'text-on-surface' },
    { label: 'Still in escrow', value: `${weiToEthTrimmed(stillAtRisk, 2)} ETH`, tone: 'text-primary' },
    { label: 'Released to founders', value: `${weiToEthTrimmed(totals.released, 2)} ETH`, tone: 'text-secondary' },
    { label: 'Claim units held', value: formatNumber(totals.units), tone: 'text-on-surface' },
  ];

  return (
    <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex-col gap-space-xs rounded-lg border-outline-variant/40 bg-surface-container p-space-md"
        >
          {/* `block` on both children: without it the label and the value share an
              inline formatting context and render side by side. */}
          <span className="block font-mono text-label-sm uppercase tracking-wider text-outline">
            {tile.label}
          </span>
          <span className={cn('block font-display text-headline-md tabular', tile.tone)}>
            {tile.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Positions, with the escrow split visible per project. */
function Positions() {
  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="font-display text-headline-sm text-on-surface">Positions</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Released capital has left escrow and is no longer recoverable through a
          refund. It is only recoverable by selling the claim.
        </p>
      </div>

      <ul className="flex-col">
        {mockPositions.map((position) => {
          const project = mockProjects.find((candidate) => candidate.id === position.projectId);
          if (!project) return null;

          const committed = BigInt(position.committed || '0');
          const released = BigInt(position.released || '0');
          const refunded = BigInt(position.refunded || '0');
          const atRisk = committed - released - refunded;

          const releasedShare = percentOf(released, committed);
          const stillHeld = percentOf(atRisk, committed);
          const refundedShare = percentOf(refunded, committed);

          const status = projectStatus(project.status);

          return (
            <li
              key={position.projectId}
              className="flex-col gap-space-sm border-b border-outline-variant/20 p-space-md last:border-0"
            >
              <div className="flex flex-wrap items-start justify-between gap-space-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-space-sm">
                    <Link
                      href={`/projects/${project.slug}`}
                      className="font-display text-headline-sm text-on-surface transition-colors hover:text-primary"
                    >
                      {project.title}
                    </Link>
                    <Badge tone={status.tone}>
                      <StatusDot tone={status.tone === 'brand' ? 'brand' : 'neutral'} />
                      {status.label}
                    </Badge>
                  </div>
                  <div className="mt-1 font-mono text-label-sm text-outline">
                    {formatNumber(position.amount)} units · avg cost{' '}
                    {weiToEthTrimmed(position.avgCost, 4)} ETH
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono text-label-sm text-outline">Committed</div>
                  <div className="font-mono tabular text-on-surface">
                    {weiToEthTrimmed(committed, 2)} ETH
                  </div>
                </div>
              </div>

              {/* Escrow decomposition: where the committed capital went. */}
              <div className="space-y-1">
                <div className="flex h-2 w-full overflow-hidden rounded bg-surface-container-lowest">
                  <span
                    aria-hidden
                    className="h-full bg-primary/70"
                    style={{ width: `${stillHeld}%` }}
                  />
                  <span
                    aria-hidden
                    className="h-full bg-secondary/70"
                    style={{ width: `${releasedShare}%` }}
                  />
                  <span
                    aria-hidden
                    className="h-full bg-outline-variant"
                    style={{ width: `${refundedShare}%` }}
                  />
                </div>
                <div className="flex-wrap gap-x-4 gap-y-1 font-mono text-label-sm">
                  <span className="inline-flex items-center gap-1.5 text-primary">
                    <span aria-hidden className="h-2 w-2 rounded-sm bg-primary/70" />
                    In escrow {weiToEthTrimmed(atRisk, 2)} ETH
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-secondary">
                    <span aria-hidden className="h-2 w-2 rounded-sm bg-secondary/70" />
                    Released {weiToEthTrimmed(released, 2)} ETH
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-on-surface-variant">
                    <span aria-hidden className="h-2 w-2 rounded-sm bg-outline-variant" />
                    Refunded {weiToEthTrimmed(refunded, 2)} ETH
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** On-chain activity ledger. */
function AuditLedger() {
  const entries = [...mockLedger].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const totalGas = entries.reduce((acc, entry) => acc + BigInt(entry.gasPaid || '0'), 0n);

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="flex flex-wrap items-center justify-between gap-space-sm border-b border-outline-variant/40 px-space-md py-space-sm">
        <div>
          <h2 className="font-display text-headline-sm text-on-surface">Activity Ledger</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Every transaction that has moved your position, with the gas you paid.
          </p>
        </div>
        <span className="rounded bg-surface-container-lowest px-space-sm py-1 font-mono text-label-sm text-on-surface-variant">
          Total gas {weiToGwei(totalGas)} gwei
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-body-sm">
          <caption className="sr-only">
            Account activity ledger: each entry shows the action, project, signed
            amounts, gas paid and transaction hash.
          </caption>
          <thead>
            <tr className="bg-surface-container-low font-mono text-label-sm uppercase tracking-wider text-outline">
              <th scope="col" className="px-space-md py-2">Action</th>
              <th scope="col" className="px-space-md py-2">Project</th>
              <th scope="col" className="px-space-md py-2 text-right">Claims</th>
              <th scope="col" className="px-space-md py-2 text-right">Value</th>
              <th scope="col" className="px-space-md py-2 text-right">Gas (gwei)</th>
              <th scope="col" className="px-space-md py-2">Tx</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const kind = ledgerKinds[entry.kind];
              const project = mockProjects.find(
                (candidate) => candidate.id === entry.projectId,
              );

              const claimAmount = BigInt(entry.amount || '0');
              const value = BigInt(entry.value || '0');

              return (
                <tr
                  key={entry.id}
                  className="border-t border-outline-variant/20 transition-colors hover:bg-surface-container-high"
                >
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
                  {/* Signed amounts: what left is negative, what arrived positive. */}
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
                        {weiToEthTrimmed(value < 0n ? -value : value, 4)} ETH
                      </span>
                    )}
                  </td>
                  <td className="px-space-md py-3 text-right font-mono text-label-sm tabular text-outline">
                    {weiToGwei(entry.gasPaid)} gwei
                  </td>
                  <td className="px-space-md py-3">
                    <span className="font-mono text-label-sm text-on-surface-variant">
                      {entry.txHash.slice(0, 10)}…
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex-wrap items-center gap-space-sm border-t border-outline-variant/40 p-space-sm">
        <Icon name="info" size={16} className="shrink-0 text-outline" />
        <p className="font-mono text-label-sm text-outline">
          Tx hashes are shortened for display. In a live deployment each links to the
          block explorer, which is the authoritative record.
        </p>
      </div>
    </section>
  );
}

export default function AccountPage() {
  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <div className="mb-1 font-mono text-label-md uppercase tracking-widest text-primary">
            {'//'} Identity, Positions & Audit
          </div>
          <h1 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
            Account
          </h1>
          <p className="mt-2 max-w-3xl text-body-md text-on-surface-variant">
            Your claim positions, how much of your committed capital is still in
            escrow, and a ledger of every transaction that moved it.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-space-lg px-space-lg py-space-lg lg:grid-cols-3 lg:px-margin">
        <div className="flex flex-col gap-space-lg lg:col-span-2">
          <ExposureSummary />
          <Positions />
          <AuditLedger />
        </div>

        <div className="flex flex-col gap-space-lg">
          <IdentityPanel />

          <section className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
            <h2 className="font-mono text-label-md uppercase tracking-wider text-on-surface">
              Positions by project
            </h2>
            <dl className="mt-space-sm flex-col gap-space-xs font-mono text-label-sm">
              {mockProjects.map((project) => {
                const position = mockPositions.find(
                  (candidate) => candidate.projectId === project.id,
                );
                return (
                  <div
                    key={project.id}
                    className="flex items-center justify-between gap-space-sm border-b border-outline-variant/20 pb-1 last:border-0"
                  >
                    <dt className="truncate text-on-surface-variant">{project.title}</dt>
                    <dd className="shrink-0 tabular text-on-surface">
                      {position ? `${formatNumber(position.amount)} units` : '—'}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>

          <section className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
            <h2 className="font-mono text-label-md uppercase tracking-wider text-on-surface">
              Manage
            </h2>
            <div className="mt-space-sm flex-col gap-space-xs">
              {[
                { label: 'Set a payout address for refunds', href: null },
                { label: 'Revoke market operator approval', href: null },
                { label: 'Export ledger (CSV)', href: null },
              ].map((action) => (
                <button
                  key={action.label}
                  type="button"
                  disabled
                  aria-disabled
                  title="Requires a connected wallet. Unavailable in this demo."
                  className="flex w-full cursor-not-allowed items-center justify-between rounded border-dashed border-outline-variant/50 px-space-sm py-2 text-left font-mono text-label-sm text-outline"
                >
                  {action.label}
                  <Icon name="lock" size={14} />
                </button>
              ))}
            </div>
            <p className="mt-space-sm font-mono text-label-sm text-outline">
              Account actions require a wallet signature and a deployed contract
              set.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
