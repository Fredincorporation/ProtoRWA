'use client';

/**
 * Read-only panels embedded in the role dashboards.
 *
 * These fold the substance of the dedicated pages (Governance, Audit & Tax,
 * Fleet Control) into the dashboard without importing their decorative, hand-
 * authored tiles - the previous mock pages carried fabricated "Portfolio Total",
 * "KYB VERIFIED" and "IoT Factory Oracles" figures that were never derived from
 * anything. Every number here is a function of the `Project[]` the catalogue
 * already reads from the chain, or is explicitly labelled demonstration data.
 */

import * as React from 'react';
import Link from 'next/link';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { SegmentedProgress } from '@/components/ui/progress';
import { demoViewer, mockLedger, mockPositions } from '@/lib/data/mock';
import { buildAlerts } from '@/lib/notifications';
import {
  formatNumber,
  formatRelativeTime,
  formatUsdgNumber,
  percentOf,
} from '@/lib/format';
import { milestoneStatus, projectStatus } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { Milestone, Project } from '@protorwa/shared';

/* ------------------------------------------------------------------ *
 * KPI tiles
 * ------------------------------------------------------------------ */

export interface StatTile {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  tone?: 'primary' | 'secondary' | 'tertiary' | 'neutral';
}

const tileTone = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  tertiary: 'text-tertiary',
  neutral: 'text-on-surface',
};

const tileIcon = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  tertiary: 'bg-tertiary/10 text-tertiary',
  neutral: 'bg-surface-container-highest text-outline',
};

export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex-col gap-space-xs rounded-xl border border-outline-variant/40 bg-surface-container-low p-space-md shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-label-sm uppercase tracking-wider text-outline">
              {tile.label}
            </span>
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg',
                tileIcon[tile.tone ?? 'neutral'],
              )}
            >
              <Icon name={tile.icon} size={16} />
            </span>
          </div>
          <div
            className={cn(
              'mt-space-sm font-display text-headline-md font-semibold tabular tracking-tight',
              tileTone[tile.tone ?? 'neutral'],
            )}
          >
            {tile.value}
          </div>
          {tile.sub ? (
            <div className="mt-0.5 font-mono text-label-sm text-on-surface-variant">{tile.sub}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Activity feed (derived from real escrow state)
 * ------------------------------------------------------------------ */

const alertTone: Record<string, string> = {
  CRITICAL: 'text-error',
  WARNING: 'text-tertiary',
  SUCCESS: 'text-primary',
  INFO: 'text-on-surface-variant',
};

export function ActivityFeed({ projects, limit = 6 }: { projects: Project[]; limit?: number }) {
  const alerts = React.useMemo(() => buildAlerts(projects).slice(0, limit), [projects, limit]);

  return (
    <Card>
      <CardHeader
        title="Escrow activity"
        description="Latest state changes across the protocol, read from live and showcase projects."
        action={
          <Link
            href="/notifications"
            className="inline-flex items-center gap-1 font-mono text-label-sm text-primary hover:underline"
          >
            All alerts
            <Icon name="arrow_forward" size={13} />
          </Link>
        }
      />
      <CardBody>
        {alerts.length === 0 ? (
          <p className="font-mono text-label-sm text-outline">No recent escrow activity.</p>
        ) : (
          <ul className="flex-col gap-space-sm">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex items-start gap-space-sm">
                <StatusDot
                  tone={
                    alert.severity === 'CRITICAL'
                      ? 'danger'
                      : alert.severity === 'WARNING'
                        ? 'warn'
                        : alert.severity === 'SUCCESS'
                          ? 'success'
                          : 'neutral'
                  }
                  pulse={alert.actionable}
                  className="mt-1.5"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={alert.href}
                    className="block truncate font-label-md text-on-surface transition-colors hover:text-primary"
                  >
                    {alert.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-label-sm text-outline">
                    <span className={alertTone[alert.severity]}>{alert.projectTitle}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(alert.createdAt)}</span>
                    <Badge tone={alert.source === 'live' ? 'success' : 'neutral'}>
                      {alert.source}
                    </Badge>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Investor: positions (holdings + project escrow decomposition)
 * ------------------------------------------------------------------ */

interface PositionRow {
  project: Project;
  units: bigint;
  /** Where the units come from, for honest labelling. */
  source: 'live' | 'demo';
  locked: bigint;
  released: bigint;
  refunded: bigint;
}

/**
 * Positions the wallet participates in.
 *
 * For live projects the unit count is the wallet's real ClaimToken balance; for
 * the offline showcase it falls back to the demo viewer's seeded position. The
 * escrow decomposition is the *project's* escrow (locked / released / refunded),
 * which is genuinely on-chain - not a fabricated per-holder split.
 */
function usePositionRows(
  projects: Project[],
  heldIds: Set<string> | undefined,
  balances: Map<string, bigint>,
): PositionRow[] {
  return React.useMemo(() => {
    const isReal = (p: Project) => p.liquidityMode === 'real';
    const held = heldIds
      ? projects.filter((p) => heldIds.has(p.id))
      : projects.filter((p) => isReal(p) || mockPositions.some((pos) => pos.projectId === p.id));

    return held.map((project) => {
      const locked = BigInt(project.escrow.locked || '0');
      const released = BigInt(project.escrow.totalReleased || '0');
      const refunded = BigInt(project.escrow.totalRefunded || '0');

      const holding = isReal(project)
        ? {
            units: project.onChainProjectId
              ? balances.get(project.onChainProjectId) ?? 0n
              : 0n,
            source: 'live' as const,
          }
        : {
            units: BigInt(mockPositions.find((pos) => pos.projectId === project.id)?.amount ?? '0'),
            source: 'demo' as const,
          };

      return { project, ...holding, locked, released, refunded };
    });
  }, [projects, heldIds, balances]);
}

export function InvestorPositionsPanel({
  projects,
  heldIds,
  balances,
  connected,
}: {
  projects: Project[];
  heldIds: Set<string> | undefined;
  balances: Map<string, bigint>;
  connected: boolean;
}) {
  const rows = usePositionRows(projects, heldIds, balances).filter((r) => r.units > 0n);

  const totalUnits = rows.reduce((acc, r) => acc + r.units, 0n);

  return (
    <Card>
      <CardHeader
        title="Your positions"
        description="Claim units you hold, and how the escrow behind each build currently sits."
        action={
          <span className="font-mono text-label-sm text-outline">
            {rows.length} {rows.length === 1 ? 'position' : 'positions'} · {formatNumber(totalUnits)}{' '}
            units
          </span>
        }
      />
      <CardBody>
        {!connected ? (
          <p className="mb-space-md flex items-start gap-1.5 rounded border border-outline-variant/40 bg-surface-container-lowest p-space-sm font-mono text-label-sm text-outline">
            <Icon name="info" size={13} className="mt-0.5 shrink-0" />
            <span>
              Not connected - showing the demo viewer ({demoViewer.handle}) positions. Connect a
              wallet to read your real ClaimToken balances.
            </span>
          </p>
        ) : null}

        {rows.length === 0 ? (
          <p className="py-space-md text-center font-mono text-label-sm text-outline">
            You hold claims in no project yet.
          </p>
        ) : (
          <ul className="flex-col gap-space-md">
            {rows.map((row) => {
              const total = row.locked + row.released + row.refunded;
              const lockedPct = total > 0n ? percentOf(row.locked, total) : 0;
              const releasedPct = total > 0n ? percentOf(row.released, total) : 0;
              const status = projectStatus(row.project.status);

              return (
                <li
                  key={row.project.id}
                  className="flex flex-col gap-space-sm rounded-lg border border-outline-variant/40 bg-surface-container-lowest p-space-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-space-sm">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-space-sm">
                        <Link
                          href={`/projects/${row.project.slug}`}
                          className="font-display text-headline-sm text-on-surface transition-colors hover:text-primary"
                        >
                          {row.project.title}
                        </Link>
                        <Badge tone={status.tone}>{status.label}</Badge>
                        <Badge tone={row.source === 'live' ? 'success' : 'neutral'}>
                          {row.source}
                        </Badge>
                      </div>
                      <div className="mt-1 font-mono text-label-sm text-on-surface-variant">
                        {formatNumber(row.units)} claim units held
                      </div>
                    </div>
                    <div className="text-right font-mono text-label-sm">
                      <div className="text-outline">Project escrow</div>
                      <div className="tabular text-on-surface">
                        {formatUsdgNumber(total, 2)} USDG
                      </div>
                    </div>
                  </div>

                  <SegmentedProgress
                    total={100}
                    segments={[
                      {
                        value: lockedPct,
                        className: 'bg-primary',
                        label: `Locked ${formatUsdgNumber(row.locked, 2)}`,
                      },
                      {
                        value: releasedPct,
                        className: 'bg-secondary',
                        label: `Released ${formatUsdgNumber(row.released, 2)}`,
                      },
                      {
                        value: Math.max(0, 100 - lockedPct - releasedPct),
                        className: 'bg-outline-variant',
                        label: `Refunded ${formatUsdgNumber(row.refunded, 2)}`,
                      },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Investor: governance oversight (derived, no fabricated bento)
 * ------------------------------------------------------------------ */

const PRIVILEGED_ROLES = [
  {
    role: 'ORACLE_ROLE',
    contract: 'MilestoneEscrow',
    power: 'Escalate a milestone review and resolve it directly, releasing or rejecting the tranche.',
    risk: 'Bypasses holder voting - the strongest power in the protocol.',
  },
  {
    role: 'FREEZER_ROLE',
    contract: 'ClaimToken',
    power: 'Freeze transfers for a single project during a dispute.',
    risk: 'Holders cannot exit while frozen.',
  },
  {
    role: 'ADMIN_ROLE',
    contract: 'SecondaryMarket',
    power: 'Change the protocol fee and withdraw accrued fees.',
    risk: 'Fee changes are snapshotted per listing, so open orders are unaffected.',
  },
];

function oversightMilestones(projects: Project[]): Array<{ project: Project; milestone: Milestone }> {
  return projects.flatMap((project) =>
    project.milestones
      .filter((milestone) => milestone.status === 'EVIDENCE' || milestone.status === 'DISPUTED')
      .map((milestone) => ({ project, milestone })),
  );
}

export function InvestorGovernancePanel({ projects }: { projects: Project[] }) {
  const underReview = oversightMilestones(projects);

  return (
    <div className="flex flex-col gap-space-lg">
      <Card>
        <CardHeader
          title="Milestones under oversight"
          description="Reviews open to backers, or escalated to the protocol oracle."
          action={
            <Badge tone={underReview.length > 0 ? 'brand' : 'neutral'}>
              <StatusDot tone={underReview.length > 0 ? 'brand' : 'neutral'} pulse={underReview.length > 0} />
              {underReview.length} open
            </Badge>
          }
        />
        <CardBody>
          {underReview.length === 0 ? (
            <p className="py-space-sm text-center font-mono text-label-sm text-outline">
              No milestones are under review right now.
            </p>
          ) : (
            <ul className="flex-col gap-space-sm">
              {underReview.map(({ project, milestone }) => {
                const status = milestoneStatus(milestone.status);
                const eligible = BigInt(milestone.votes.eligible || '0');
                const approve = percentOf(BigInt(milestone.votes.approve || '0'), eligible);
                const reject = percentOf(BigInt(milestone.votes.reject || '0'), eligible);
                const abstain = percentOf(BigInt(milestone.votes.abstain || '0'), eligible);

                return (
                  <li
                    key={`${project.id}-${milestone.index}`}
                    className="flex flex-col gap-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest p-space-md"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-space-sm">
                      <div className="flex min-w-0 flex-wrap items-center gap-space-sm">
                        <Link
                          href={`/projects/${project.slug}`}
                          className="truncate font-label-md text-on-surface hover:text-primary"
                        >
                          {project.title}
                        </Link>
                        <span className="font-mono text-label-sm text-outline">
                          M{String(milestone.index + 1).padStart(2, '0')}
                        </span>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                      <span className="font-mono tabular text-label-sm text-secondary">
                        {formatUsdgNumber(milestone.trancheAmount, 2)} USDG
                      </span>
                    </div>
                    <SegmentedProgress
                      total={100}
                      segments={[
                        { value: approve, className: 'bg-primary', label: `Approve ${approve.toFixed(1)}%` },
                        { value: reject, className: 'bg-error', label: `Reject ${reject.toFixed(1)}%` },
                        { value: abstain, className: 'bg-outline', label: `Abstain ${abstain.toFixed(1)}%` },
                      ]}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Privileged roles"
          description="Real capabilities over escrowed capital. A deployment should hold these in a multisig."
        />
        <CardBody>
          <ul className="flex-col gap-space-sm">
            {PRIVILEGED_ROLES.map((entry) => (
              <li
                key={entry.role}
                className="flex flex-col gap-1 border-b border-outline-variant/20 pb-space-sm last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-space-sm">
                  <span className="rounded border border-tertiary/40 bg-tertiary/10 px-2 py-0.5 font-mono text-label-sm uppercase tracking-wider text-tertiary">
                    {entry.role}
                  </span>
                  <span className="font-mono text-label-sm text-on-surface-variant">
                    on {entry.contract}
                  </span>
                </div>
                <p className="text-body-sm text-on-surface">{entry.power}</p>
                <p className="flex items-start gap-1.5 text-body-sm text-tertiary">
                  <Icon name="warning" size={14} className="mt-1 shrink-0" />
                  {entry.risk}
                </p>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Investor: audit & tax ledger
 * ------------------------------------------------------------------ */

const ledgerKindLabel: Record<string, string> = {
  COMMIT: 'Commit',
  CLAIM_MINT: 'Claim minted',
  LISTING_CREATE: 'Listing created',
  LISTING_FILL: 'Listing filled',
  ORDER_FILL: 'Order filled',
  MILESTONE_RELEASE: 'Tranche released',
  REFUND: 'Refund',
  VOTE_CAST: 'Vote cast',
  TRANSFER: 'Transfer',
};

const projectTitle = (projects: Project[], id: string | null): string =>
  projects.find((p) => p.id === id)?.title ?? '—';

export function InvestorAuditPanel({ projects }: { projects: Project[] }) {
  const entries = React.useMemo(
    () =>
      [...mockLedger].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    [],
  );

  return (
    <Card>
      <CardHeader
        title="Audit & tax ledger"
        description="Demonstration activity for the demo viewer. Live settlements are the on-chain record - open a project's explorer link for authoritative history."
      />
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <caption className="sr-only">
              Illustrative activity ledger: action, project, signed claims, value and gas.
            </caption>
            <thead>
              <tr className="bg-surface-container-low font-mono text-label-sm uppercase tracking-wider text-outline">
                <th scope="col" className="px-space-md py-2">Action</th>
                <th scope="col" className="px-space-md py-2">Project</th>
                <th scope="col" className="px-space-md py-2 text-right">Claims</th>
                <th scope="col" className="px-space-md py-2 text-right">Value</th>
                <th scope="col" className="px-space-md py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const amount = BigInt(entry.amount || '0');
                const value = BigInt(entry.value || '0');
                return (
                  <tr
                    key={entry.id}
                    className="border-t border-outline-variant/20 transition-colors hover:bg-surface-container-high"
                  >
                    <th scope="row" className="px-space-md py-2 text-left font-medium text-on-surface">
                      {ledgerKindLabel[entry.kind] ?? entry.kind}
                    </th>
                    <td className="px-space-md py-2 text-on-surface-variant">
                      {projectTitle(projects, entry.projectId)}
                    </td>
                    <td className="px-space-md py-2 text-right font-mono tabular">
                      {amount === 0n ? (
                        <span className="text-outline">—</span>
                      ) : (
                        <span className={amount < 0n ? 'text-error' : 'text-primary'}>
                          {amount > 0n ? '+' : ''}
                          {formatNumber(amount)}
                        </span>
                      )}
                    </td>
                    <td className="px-space-md py-2 text-right font-mono tabular">
                      {value === 0n ? (
                        <span className="text-outline">—</span>
                      ) : (
                        <span className={value < 0n ? 'text-error' : 'text-primary'}>
                          {value > 0n ? '+' : '−'}
                          {formatUsdgNumber(value < 0n ? -value : value, 4)} USDG
                        </span>
                      )}
                    </td>
                    <td className="px-space-md py-2 font-mono text-label-sm text-outline">
                      {formatRelativeTime(entry.timestamp)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Founder: fleet control (escrow + pipeline across owned projects)
 * ------------------------------------------------------------------ */

export function FleetControlPanel({
  projects,
  address,
}: {
  projects: Project[];
  address: string | undefined;
}) {
  const owned = React.useMemo(() => {
    if (!address) return [];
    return projects.filter(
      (p) => p.founder.toLowerCase() === address.toLowerCase(),
    );
  }, [projects, address]);

  const totals = owned.reduce(
    (acc, p) => ({
      locked: acc.locked + BigInt(p.escrow.locked || '0'),
      released: acc.released + BigInt(p.escrow.totalReleased || '0'),
      awaiting:
        acc.awaiting +
        p.milestones.filter((m) => m.status === 'PENDING' || m.status === 'REJECTED').length,
    }),
    { locked: 0n, released: 0n, awaiting: 0 },
  );

  if (owned.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Fleet control"
          description="Escrow and milestone pipeline across the builds you founded."
        />
        <CardBody>
          <p className="flex items-start gap-1.5 font-mono text-label-sm text-outline">
            <Icon name={address ? 'inbox' : 'account_balance_wallet'} size={13} className="mt-0.5 shrink-0" />
            <span>
              {address
                ? 'This wallet has not founded any project on this deployment. Launch one from the Founder Studio tab.'
                : 'Connect a founder wallet to see your fleet.'}
            </span>
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Fleet control"
        description="Where committed capital sits and what is blocking the next release."
      />
      <CardBody className="flex flex-col gap-space-md">
        <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-3">
          <div className="rounded-lg bg-surface-container-lowest p-space-sm">
            <span className="block font-mono text-label-sm uppercase tracking-wider text-outline">
              Still in escrow
            </span>
            <span className="font-display text-headline-sm tabular text-primary">
              {formatUsdgNumber(totals.locked, 2)} USDG
            </span>
          </div>
          <div className="rounded-lg bg-surface-container-lowest p-space-sm">
            <span className="block font-mono text-label-sm uppercase tracking-wider text-outline">
              Released to you
            </span>
            <span className="font-display text-headline-sm tabular text-secondary">
              {formatUsdgNumber(totals.released, 2)} USDG
            </span>
          </div>
          <div className="rounded-lg bg-surface-container-lowest p-space-sm">
            <span className="block font-mono text-label-sm uppercase tracking-wider text-outline">
              Awaiting your evidence
            </span>
            <span className="font-display text-headline-sm tabular text-on-surface">
              {formatNumber(totals.awaiting)}
            </span>
          </div>
        </div>

        <ul className="flex-col gap-space-sm">
          {owned.map((project) => {
            const status = projectStatus(project.status);
            const committed = BigInt(project.escrow.totalCommitted || '0');
            const target = BigInt(project.escrow.target || '0');
            const funded = percentOf(committed, target > 0n ? target : 1n);
            const next = project.milestones.find((m) => m.status !== 'APPROVED');

            return (
              <li
                key={project.id}
                className="flex flex-col gap-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest p-space-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-space-sm">
                  <div className="flex min-w-0 flex-wrap items-center gap-space-sm">
                    <Link
                      href={`/studio/control`}
                      className="truncate font-display text-headline-sm text-on-surface hover:text-primary"
                    >
                      {project.title}
                    </Link>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <Badge tone={project.liquidityMode === 'real' ? 'success' : 'neutral'}>
                      {project.liquidityMode === 'real' ? 'live' : 'demo'}
                    </Badge>
                  </div>
                  <span className="font-mono text-label-sm text-outline">
                    {funded.toFixed(1)}% funded
                  </span>
                </div>
                {next ? (
                  <p className="flex flex-wrap items-center gap-1.5 font-mono text-label-sm text-on-surface-variant">
                    <Icon name="flag" size={13} className="text-outline" />
                    Next: {next.title} · {formatUsdgNumber(next.trancheAmount, 2)} USDG tranche ·{' '}
                    {milestoneStatus(next.status).label}
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 font-mono text-label-sm text-primary">
                    <Icon name="check_circle" size={13} />
                    All tranches released
                  </p>
                )}
                <Link
                  href="/studio/control"
                  className="self-start inline-flex items-center gap-1 rounded border border-outline-variant/50 px-space-sm py-1 font-mono text-label-sm text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
                >
                  Open control surface
                  <Icon name="arrow_forward" size={13} />
                </Link>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
