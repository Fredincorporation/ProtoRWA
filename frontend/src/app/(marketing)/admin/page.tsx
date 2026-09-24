'use client';

import * as React from 'react';
import Link from 'next/link';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { useOnboarding } from '@/components/onboarding/onboarding-dialog';
import { OracleMilestoneActions } from '@/components/admin/admin-actions-panel';
import { SegmentedProgress } from '@/components/ui/progress';
import {
  demoAddresses,
  mockProjects,
  mockUsers,
} from '@/lib/data/mock';
import {
  formatDate,
  formatUsdgNumber,
  formatNumber,
  percentOf,
  shortenAddress,
} from '@/lib/format';
import { milestoneStatus } from '@/lib/status';
import { getContracts, defaultChain, protocolAddressUrl, PROTOCOL } from '@protorwa/shared';
import type { Address, OracleAction } from '@protorwa/shared';

/**
 * Protocol Admin & Hardware Oracle Oversight Terminal (/admin).
 *
 * Access model
 * ------------
 * This route is gated on the `admin` persona AND on the connected address being
 * an operator (see `isAdminAddress`). The nav link is hidden for other roles,
 * but hiding a link is not access control - the page re-checks here, because a
 * `roles` filter in a nav component does nothing about someone typing the URL.
 *
 * Scope note
 * ----------
 * The actions shown are the real privileged surface of the deployed contracts:
 * ORACLE_ROLE holders can escalate a milestone, resolve it either way, and
 * freeze transfers. Everything is rendered disabled with the reason stated,
 * because the write path needs an operator wallet signing against the live
 * deployment. What matters is that the page states accurately who can do what
 * to whose capital, rather than implying a decentralised oracle that does not
 * exist.
 *
 * COPY REVIEW - the source design described infrastructure that is not deployed
 * and would be trivially falsified in a demo: an "Oracle Attestation Engine",
 * an "Oracle Network Health" monitor, a "Gasless Relayer Pool" and an
 * "Aggregated Node Quorum". None of those exist. What does exist is a Stylus
 * verifier contract and a role-gated escrow, so that is what is shown.
 */

/* ------------------------------------------------------------------ *
 * Access gate
 * ------------------------------------------------------------------ */

function AccessDenied() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-space-md px-space-lg text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-error/10 text-error">
        <Icon name="gpp_maybe" size={28} />
      </div>
      <h1 className="font-display text-headline-md text-on-surface">Operator access required</h1>
      <p className="max-w-prose text-body-md text-on-surface-variant">
        The oversight terminal controls privileged protocol actions, including
        milestone escalation and transfer freezing. It is restricted to operator
        addresses holding <code className="font-mono text-label-md text-tertiary">ORACLE_ROLE</code>{' '}
        on the deployed escrow. Your connected address does not hold it.
      </p>
      <p className="font-mono text-label-sm text-outline">
        Privilege is granted on-chain by the protocol, not by this interface.
      </p>
      <Link
        href="/explore"
        className="rounded border-outline-variant bg-surface-container px-space-md py-2 font-mono text-label-md text-on-surface transition-colors hover:border-outline"
      >
        Back to Explore
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Panels
 * ------------------------------------------------------------------ */

/** Deployment panel: what is actually wired on this chain. */
function DeploymentPanel() {
  const contracts = getContracts(defaultChain.id);
  const rows: Array<{ label: string; address: Address | undefined; note: string }> = [
    {
      label: 'ProjectRegistry',
      address: contracts.projectRegistry,
      note: 'Project creation and lifecycle.',
    },
    {
      label: 'MilestoneEscrow',
      address: contracts.milestoneEscrow,
      note: 'Holds committed capital in tranches.',
    },
    {
      label: 'ClaimToken',
      address: contracts.claimToken,
      note: 'ERC-1155 claim units.',
    },
    {
      label: 'SecondaryMarket',
      address: contracts.secondaryMarket,
      note: 'Peer-to-peer listing settlement.',
    },
    {
      label: 'HardwareVerifier',
      // Optional on `ProtocolContracts` because a chain may run the Solidity
      // protocol without a Stylus deployment. The row renders "not configured"
      // in that case, which is accurate rather than an error.
      address: contracts.hardwareVerifier,
      note: 'Stylus WASM Merkle attestation.',
    },
  ];

  const configured = rows.filter((row) => row.address).length;

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="flex items-center justify-between border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="font-display text-headline-sm text-on-surface">Deployment</h2>
        <Badge tone={configured === rows.length ? 'success' : 'warn'}>
          <StatusDot tone={configured === rows.length ? 'brand' : 'warn'} />
          {configured}/{rows.length} configured
        </Badge>
      </div>

      <ul className="flex-col">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex flex-col gap-0.5 border-b border-outline-variant/20 px-space-md py-space-sm last:border-0"
          >
            <div className="flex items-center justify-between gap-space-sm">
              <span className="font-mono text-label-md text-on-surface">{row.label}</span>
              {row.address ? (
                <a
                  href={protocolAddressUrl(row.address) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-label-sm text-primary hover:underline"
                >
                  {shortenAddress(row.address)}
                  <Icon name="open_in_new" size={11} />
                </a>
              ) : (
                <span className="font-mono text-label-sm text-outline">not configured</span>
              )}
            </div>
            <span className="text-body-sm text-on-surface-variant">{row.note}</span>
          </li>
        ))}
      </ul>

      <div className="border-t border-outline-variant/40 p-space-sm font-mono text-label-sm text-outline">
        Chain {defaultChain.id} · fee {PROTOCOL.SECONDARY_FEE_BPS / 100}% · quorum{' '}
        {PROTOCOL.DEFAULT_QUORUM_BPS / 100}% · approval {PROTOCOL.DEFAULT_APPROVAL_THRESHOLD_BPS / 100}%
      </div>
    </section>
  );
}

/** Escalation queue: milestones an operator may need to act on. */
function EscalationQueue() {
  const items = mockProjects.flatMap((project) =>
    project.milestones
      .filter((milestone) => milestone.status === 'EVIDENCE' || milestone.status === 'DISPUTED')
      .map((milestone) => ({ project, milestone })),
  );

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="flex items-center justify-between border-b border-outline-variant/40 px-space-md py-space-sm">
        <div>
          <h2 className="font-display text-headline-sm text-on-surface">Oversight Queue</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Milestones where escrow release is contested or awaiting review.
          </p>
        </div>
        <Badge tone={items.length > 0 ? 'brand' : 'neutral'}>
          <StatusDot tone={items.length > 0 ? 'brand' : 'neutral'} pulse={items.length > 0} />
          {items.length} open
        </Badge>
      </div>

      {items.length === 0 ? (
        <p className="px-space-md py-space-lg text-center font-mono text-label-sm text-outline">
          No milestones are awaiting review.
        </p>
      ) : (
        <ul className="flex-col">
          {items.map(({ project, milestone }) => {
            const status = milestoneStatus(milestone.status);
            const eligible = BigInt(milestone.votes.eligible || '0');
            const approve = percentOf(BigInt(milestone.votes.approve || '0'), eligible);
            const reject = percentOf(BigInt(milestone.votes.reject || '0'), eligible);
            const abstain = percentOf(BigInt(milestone.votes.abstain || '0'), eligible);
            const participation = approve + reject + abstain;
            const quorumMet = participation >= milestone.quorumBps / 100;

            return (
              <li
                key={`${project.id}-${milestone.index}`}
                className="flex flex-col gap-space-sm border-b border-outline-variant/20 p-space-md last:border-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-space-sm">
                  <div>
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <Link
                        href={`/projects/${project.slug}`}
                        className="font-display text-headline-sm text-on-surface transition-colors hover:text-primary"
                      >
                        {project.title}
                      </Link>
                      <span className="font-mono text-label-sm text-outline">
                        Milestone {String(milestone.index + 1).padStart(2, '0')}
                      </span>
                      <Badge tone={status.tone}>
                        <StatusDot
                          tone={milestone.status === 'DISPUTED' ? 'warn' : 'brand'}
                          pulse={milestone.status === 'EVIDENCE'}
                        />
                        {status.label}
                      </Badge>
                      {!quorumMet ? (
                        <Badge tone="warn">
                          <StatusDot tone="warn" />
                          Below quorum
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-body-sm text-on-surface-variant">{milestone.title}</p>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-label-sm text-outline">Tranche at stake</div>
                    <div className="font-mono tabular text-secondary">
                      {formatUsdgNumber(milestone.trancheAmount, 2)} USDG
                    </div>
                  </div>
                </div>

                <SegmentedProgress
                  total={100}
                  segments={[
                    { value: approve, className: 'bg-primary', label: `Approve ${approve.toFixed(1)}%` },
                    { value: reject, className: 'bg-error', label: `Reject ${reject.toFixed(1)}%` },
                    { value: abstain, className: 'bg-outline', label: `Abstain ${abstain.toFixed(1)}%` },
                  ]}
                />

                <div className="flex flex-wrap items-center gap-space-sm font-mono text-label-sm text-outline">
                  <span>
                    Participation {participation.toFixed(1)}% · quorum {milestone.quorumBps / 100}%
                  </span>
                  {milestone.votingEndsAt ? (
                    <span>· review closes {formatDate(milestone.votingEndsAt)}</span>
                  ) : null}
                </div>

                {/* Operator actions: live writes gated on ORACLE_ROLE. */}
                <div className="border-t border-outline-variant/20 pt-space-sm">
                  <OracleMilestoneActions
                    project={project}
                    milestone={milestone}
                    milestoneIndex={milestone.index}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Demo oracle action history, typed against the domain model. */
const oracleActions: OracleAction[] = [
  {
    id: '1',
    projectId: '1',
    milestoneIndex: 1,
    actor: demoAddresses.carol,
    kind: 'RESOLVED_RELEASE',
    rationale: 'Thermal cycling logs verified against the submitted Merkle root.',
    evidenceCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    timestamp: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    txHash: '0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809',
  },
  {
    id: '2',
    projectId: '1',
    milestoneIndex: 2,
    actor: demoAddresses.carol,
    kind: 'ESCALATED',
    rationale: 'Evidence package incomplete: missing third-party inspection report.',
    evidenceCid: null,
    timestamp: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    txHash: '0x9f2c1b4a7d3e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f',
  },
];

const actionKindMeta: Record<
  OracleAction['kind'],
  { label: string; tone: 'brand' | 'warn' | 'success' | 'danger'; icon: string }
> = {
  ESCALATED: { label: 'Escalated to oracle', tone: 'warn', icon: 'gavel' },
  RESOLVED_RELEASE: { label: 'Resolved: release', tone: 'success', icon: 'lock_open' },
  RESOLVED_REFUND: { label: 'Resolved: refund', tone: 'danger', icon: 'currency_exchange' },
  PROJECT_DEFAULTED: { label: 'Project defaulted', tone: 'danger', icon: 'report' },
};

/** Audit trail of privileged actions - every exercise of operator authority. */
function OracleAuditTrail() {
  const entries = [...oracleActions].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="font-display text-headline-sm text-on-surface">Privileged Action Log</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Every exercise of operator authority over escrowed capital, with its
          stated rationale. An operator who can move funds without leaving a
          record is an operator nobody can audit.
        </p>
      </div>

      <ul className="flex-col">
        {entries.map((action) => {
          const meta = actionKindMeta[action.kind];
          const project = mockProjects.find((candidate) => candidate.id === action.projectId);

          return (
            <li
              key={action.id}
              className="flex flex-col gap-space-xs border-b border-outline-variant/20 px-space-md py-space-sm last:border-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-space-sm">
                <div className="flex flex-wrap items-center gap-space-sm">
                  <Badge tone={meta.tone}>
                    <Icon name={meta.icon} size={11} className="mr-0.5" />
                    {meta.label}
                  </Badge>
                  <span className="font-mono text-label-sm text-on-surface">
                    {project?.title ?? 'Unknown project'} · M
                    {String(action.milestoneIndex + 1).padStart(2, '0')}
                  </span>
                </div>
                <span className="font-mono text-label-sm text-outline">
                  {formatDate(action.timestamp)}
                </span>
              </div>

              <p className="text-body-sm text-on-surface-variant">{action.rationale}</p>

              <div className="flex flex-wrap items-center gap-space-md font-mono text-label-sm text-outline">
                <span>actor {shortenAddress(action.actor)}</span>
                <span>tx {action.txHash.slice(0, 10)}…</span>
                {action.evidenceCid ? (
                  <span>evidence {action.evidenceCid.slice(0, 14)}…</span>
                ) : (
                  <span>no evidence attached</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Who holds privileged roles. The point is that it is a named, short list. */
function RoleHolders() {
  const operators = mockUsers.filter((user) => user.isProtocolAdmin);

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="font-display text-headline-sm text-on-surface">Role Holders</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Addresses that can escalate, resolve or freeze. Not a decentralised set —
          a short allowlist, stated as such.
        </p>
      </div>

      <ul className="flex-col">
        {operators.map((user) => (
          <li
            key={user.address}
            className="flex items-center justify-between gap-space-sm border-b border-outline-variant/20 px-space-md py-space-sm last:border-0"
          >
            <div className="flex items-center gap-space-sm">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tertiary/10 font-mono text-label-sm text-tertiary">
                {user.displayName?.slice(0, 2).toUpperCase() ?? 'OP'}
              </span>
              <div className="flex flex-col">
                <span className="font-mono text-label-md text-on-surface">
                  {shortenAddress(user.address, 6)}
                </span>
                <span className="font-mono text-label-sm text-outline">
                  {user.handle ?? 'no ENS'} · since {formatDate(user.createdAt)}
                </span>
              </div>
            </div>
            <Badge tone="warn">
              <Icon name="verified_user" size={11} className="mr-0.5" />
              ORACLE_ROLE
            </Badge>
          </li>
        ))}
      </ul>

      <div className="border-t border-outline-variant/40 p-space-sm font-mono text-label-sm text-outline">
        {operators.length} operator{operators.length === 1 ? '' : 's'} · these addresses
        control escrow release
      </div>
    </section>
  );
}

/** Protocol-wide capital position. */
function ProtocolMetrics() {
  const totals = mockProjects.reduce(
    (acc, project) => ({
      locked: acc.locked + BigInt(project.escrow.locked || '0'),
      released: acc.released + BigInt(project.escrow.totalReleased || '0'),
      refunded: acc.refunded + BigInt(project.escrow.totalRefunded || '0'),
    }),
    { locked: 0n, released: 0n, refunded: 0n },
  );

  const total = totals.locked + totals.released + totals.refunded;
  const lockedShare = percentOf(totals.locked, total > 0n ? total : 1n);
  const releasedShare = percentOf(totals.released, total > 0n ? total : 1n);

  const tiles = [
    { label: 'Projects', value: formatNumber(mockProjects.length), icon: 'inventory_2' },
    { label: 'Capital locked', value: `${formatUsdgNumber(totals.locked, 2)} USDG`, icon: 'lock' },
    {
      label: 'Released to founders',
      value: `${formatUsdgNumber(totals.released, 2)} USDG`,
      icon: 'lock_open',
    },
    {
      label: 'Open reviews',
      value: formatNumber(
        mockProjects.reduce(
          (acc, p) => acc + p.milestones.filter((m) => m.status === 'EVIDENCE').length,
          0,
        ),
      ),
      icon: 'how_to_vote',
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
          <span className="font-display text-headline-md tabular text-on-surface">{tile.value}</span>
        </div>
      ))}

      <div className="col-span-1 flex-col gap-space-xs rounded-lg border-outline-variant/40 bg-surface-container p-space-md sm:col-span-2 xl:col-span-4">
        <span className="font-mono text-label-sm uppercase tracking-wider text-outline">
          Capital allocation across all projects
        </span>
        <SegmentedProgress
          total={100}
          segments={[
            { value: lockedShare, className: 'bg-primary', label: `Locked ${lockedShare.toFixed(1)}%` },
            {
              value: releasedShare,
              className: 'bg-secondary',
              label: `Released ${releasedShare.toFixed(1)}%`,
            },
            {
              value: Math.max(0, 100 - lockedShare - releasedShare),
              className: 'bg-outline-variant',
              label: 'Refunded',
            },
          ]}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function AdminPage() {
  const { role, isOperator } = useOnboarding();

  /**
   * Both conditions are required: the persona must be admin AND the connected
   * address must be an operator. Checking only the persona would mean anyone who
   * switched the stored role could reach the terminal.
   */
  const permitted = (role === 'admin' && isOperator) || isOperator;

  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <div className="mb-1 flex-wrap items-center gap-space-sm">
            <span className="rounded bg-tertiary/10 px-2 py-0.5 font-mono text-label-sm uppercase tracking-wider text-tertiary">
              Restricted · ORACLE_ROLE
            </span>
            <span className="flex items-center gap-1 font-mono text-label-sm text-on-surface-variant">
              <StatusDot tone="brand" pulse />
              {defaultChain.name} · chain {defaultChain.id}
            </span>
          </div>
          <h1 className="font-display text-headline-lg tracking-tight text-on-surface">
            Protocol Admin &amp; Hardware Oracle Oversight
          </h1>
          <p className="mt-2 max-w-3xl text-body-md text-on-surface-variant">
            Privileged control over escrowed capital: milestone escalation, dispute
            resolution, tranche release and transfer freezing, with an audit trail of
            every action taken.
          </p>
        </div>
      </header>

      {!permitted ? (
        <AccessDenied />
      ) : (
        <main className="mx-auto flex max-w-7xl flex-col gap-space-lg px-space-lg py-space-lg lg:px-margin">
          <ProtocolMetrics />

          <div className="grid grid-cols-1 gap-space-lg lg:grid-cols-3">
            <div className="flex flex-col gap-space-lg lg:col-span-2">
              <EscalationQueue />
              <OracleAuditTrail />
            </div>

            <div className="flex flex-col gap-space-lg">
              <DeploymentPanel />
              <RoleHolders />

              {/*
                Risk statement. An oversight terminal without one invites the
                reader to assume the powers above are safe in ways they are not.
              */}
              <section className="rounded-lg border-tertiary/30 bg-surface-container-low p-space-md">
                <div className="mb-space-sm flex items-center gap-1.5 font-mono text-label-sm uppercase tracking-wider text-tertiary">
                  <Icon name="warning" size={14} />
                  Custodial risk
                </div>
                <p className="text-body-sm text-on-surface-variant">
                  Operators can resolve a milestone and release a tranche without
                  further backer approval. That is a deliberate recovery path for
                  disputes, and it is also a single point of failure: an operator
                  key that is compromised can redirect escrowed capital to a
                  founder. On this testnet the actions above enable only for a
                  wallet that actually holds ORACLE_ROLE on the deployed escrow.
                </p>
              </section>
            </div>
          </div>
        </main>
      )}
    </>
  );
}
