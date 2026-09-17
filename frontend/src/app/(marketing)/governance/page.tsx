import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { SegmentedProgress } from '@/components/ui/progress';
import { mockProjects } from '@/lib/data/mock';
import { formatDate, formatEthNumber, percentOf, weiToEthTrimmed } from '@/lib/format';
import { milestoneStatus, projectStatus } from '@/lib/status';
import { PROTOCOL } from '@protorwa/shared';

export const metadata: Metadata = {
  title: 'Governance & Oracle Oversight',
  description:
    'Protocol administration: milestone escalation, dispute resolution, transfer freezing and the audit trail of privileged actions.',
};

/**
 * Protocol oversight (/governance).
 *
 * Ported in structure from the design's "Protocol Oversight & Oracle Attestation
 * Engine": an oversight queue, network/health panel, guard controls and an audit
 * stream.
 *
 * COPY REVIEW REQUIRED - the source design described infrastructure that does not
 * exist and would be trivially falsified:
 *   "Oracle Attestation Engine"  -> there is no automated attestation engine.
 *   "Oracle Network Health"      -> no oracle network exists.
 *   "Gasless Relayer Pool"       -> no relayer; users pay gas.
 *   "Aggregated Node Quorum"     -> no node set.
 *   A fabricated 0x… contract id -> replaced with env-driven addresses.
 *
 * What this page now shows is the real privileged surface defined in
 * MilestoneEscrow.sol and ClaimToken.sol: ORACLE_ROLE holders can escalate a
 * milestone, resolve it, and freeze transfers. Because that is genuine authority
 * over other people's capital, the page states plainly who holds it and what it
 * can do, rather than dressing it up as decentralised.
 */

/** Escalation/dispute queue derived from the demo milestones. */
function OversightQueue() {
  const items = mockProjects.flatMap((project) =>
    project.milestones
      .filter((milestone) => milestone.status === 'EVIDENCE' || milestone.status === 'DISPUTED')
      .map((milestone) => ({ project, milestone })),
  );

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="flex items-center justify-between border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="font-display text-headline-sm text-on-surface">
          Milestones Awaiting or Under Review
        </h2>
        <Badge tone={items.length > 0 ? 'brand' : 'neutral'}>
          <StatusDot tone={items.length > 0 ? 'brand' : 'neutral'} pulse={items.length > 0} />
          {items.length} open
        </Badge>
      </div>

      {items.length === 0 ? (
        <p className="px-space-md py-space-lg text-center font-mono text-label-sm text-outline">
          No milestones are under review.
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
                className="flex-col gap-space-sm border-b border-outline-variant/20 p-space-md last:border-0"
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
                    </div>
                    <p className="mt-1 text-body-sm text-on-surface-variant">
                      {milestone.title}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-label-sm text-outline">Tranche</div>
                    <div className="font-mono tabular text-secondary">
                      {formatEthNumber(milestone.trancheAmount, 2)} ETH
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

                <div className="flex flex-wrap items-center justify-between gap-space-sm font-mono text-label-sm">
                  <span className={quorumMet ? 'text-primary' : 'text-tertiary'}>
                    {quorumMet ? 'Quorum met' : 'Quorum not met'} — {participation.toFixed(1)}% of{' '}
                    {milestone.quorumBps / 100}% required
                  </span>
                  <span className="text-outline">
                    Closes {formatDate(milestone.votingEndsAt ?? milestone.dueAt)}
                  </span>
                </div>

                {/* Escalation is the real oracle power; stated as such. */}
                <div className="flex-wrap items-center gap-space-sm rounded bg-surface-container-lowest p-space-sm">
                  <Icon name="gavel" size={16} className="shrink-0 text-tertiary" />
                  <span className="flex-1 font-mono text-label-sm text-on-surface-variant">
                    An ORACLE_ROLE holder can escalate this review and resolve it
                    directly, bypassing the vote.
                  </span>
                  <button
                    type="button"
                    disabled
                    aria-disabled
                    title="Requires a connected wallet holding ORACLE_ROLE."
                    className="cursor-not-allowed rounded border-dashed border-outline-variant/60 px-space-sm py-1.5 font-mono text-label-sm text-outline"
                  >
                    Escalate
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The privileged surface, described honestly rather than as "network health". */
function PrivilegedSurface() {
  const powers = [
    {
      role: 'ORACLE_ROLE',
      contract: 'MilestoneEscrow',
      power: 'Escalate a milestone review and resolve it directly, releasing or rejecting the tranche.',
      risk: 'Bypasses holder voting entirely. This is the strongest power in the protocol.',
    },
    {
      role: 'DEFAULT_ADMIN_ROLE',
      contract: 'ClaimToken',
      power: 'Pause all claim transfers, and grant or revoke other roles.',
      risk: 'A pause halts secondary trading across every project.',
    },
    {
      role: 'FREEZER_ROLE',
      contract: 'ClaimToken',
      power: 'Freeze transfers for a single project during a dispute.',
      risk: 'Halts trading in that project; holders cannot exit while frozen.',
    },
    {
      role: 'ADMIN_ROLE',
      contract: 'SecondaryMarket',
      power: 'Change the protocol fee and withdraw accrued fees.',
      risk: 'Fee changes are snapshotted per listing, so open orders are unaffected.',
    },
  ];

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="font-display text-headline-sm text-on-surface">
          Privileged Roles and What They Can Do
        </h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          These are real capabilities over other people&apos;s capital. A
          deployment should hold them in a multisig, not a single key.
        </p>
      </div>

      <ul className="flex-col">
        {powers.map((power) => (
          <li
            key={power.role}
            className="flex-col gap-space-xs border-b border-outline-variant/20 p-space-md last:border-0"
          >
            <div className="flex flex-wrap items-center gap-space-sm">
              <span className="rounded border-tertiary/40 bg-tertiary/10 px-2 py-0.5 font-mono text-label-sm uppercase tracking-wider text-tertiary">
                {power.role}
              </span>
              <span className="font-mono text-label-sm text-on-surface-variant">
                on {power.contract}
              </span>
            </div>
            <p className="text-body-sm text-on-surface">{power.power}</p>
            <p className="flex items-start gap-1.5 text-body-sm text-tertiary">
              <Icon name="warning" size={14} className="mt-1 shrink-0" />
              {power.risk}
            </p>
          </li>
        ))}
      </ul>

      <div className="border-t border-outline-variant/40 p-space-md">
        <div className="flex flex-wrap items-center gap-space-sm">
          <Icon name="key" size={16} className="shrink-0 text-outline" />
          <span className="font-mono text-label-sm text-on-surface-variant">
            Role holders are set at deploy time by{' '}
            <span className="text-secondary">contracts/script/Deploy.sol</span>, which
            grants every role to the deploying address.
          </span>
        </div>
      </div>
    </section>
  );
}

/** Deployment state, read from env. */
function DeploymentPanel() {
  const entries = [
    { name: 'ProjectRegistry', address: process.env.NEXT_PUBLIC_PROJECT_REGISTRY },
    { name: 'ClaimToken', address: process.env.NEXT_PUBLIC_CLAIM_TOKEN },
    { name: 'MilestoneEscrow', address: process.env.NEXT_PUBLIC_MILESTONE_ESCROW },
    { name: 'SecondaryMarket', address: process.env.NEXT_PUBLIC_SECONDARY_MARKET },
  ];

  const configured = entries.filter(
    (entry): entry is { name: string; address: string } => Boolean(entry.address),
  );

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="font-display text-headline-sm text-on-surface">Deployment</h2>
      </div>

      <div className="p-space-md">
        {configured.length === 0 ? (
          <div className="flex items-start gap-space-sm rounded bg-surface-container-lowest p-space-sm">
            <Icon name="info" size={16} className="mt-0.5 shrink-0 text-outline" />
            <p className="font-mono text-label-sm text-on-surface-variant">
              No contracts are deployed on this network, so no addresses are shown.
              Run <span className="text-secondary">forge script/Deploy.sol</span> and
              copy the printed values into{' '}
              <span className="text-secondary">.env.local</span>.
            </p>
          </div>
        ) : (
          <dl className="flex-col gap-space-xs">
            {configured.map((entry) => (
              <div
                key={entry.name}
                className="flex items-center justify-between gap-space-sm border-b border-outline-variant/20 pb-1 font-mono text-label-sm last:border-0"
              >
                <dt className="text-on-surface-variant">{entry.name}</dt>
                <dd className="truncate text-primary">{entry.address}</dd>
              </div>
            ))}
          </dl>
        )}

        <dl className="mt-space-md grid-cols-2 gap-space-sm font-mono text-label-sm">
          <div>
            <dt className="text-outline">Approval threshold</dt>
            <dd className="tabular text-on-surface">
              {PROTOCOL.DEFAULT_APPROVAL_THRESHOLD_BPS / 100}%
            </dd>
          </div>
          <div>
            <dt className="text-outline">Quorum</dt>
            <dd className="tabular text-on-surface">{PROTOCOL.DEFAULT_QUORUM_BPS / 100}%</dd>
          </div>
          <div>
            <dt className="text-outline">Review window</dt>
            <dd className="tabular text-on-surface">
              {PROTOCOL.DEFAULT_VOTING_PERIOD_SECONDS / 86_400} days
            </dd>
          </div>
          <div>
            <dt className="text-outline">Secondary fee</dt>
            <dd className="tabular text-on-surface">
              {PROTOCOL.SECONDARY_FEE_BPS / 100}%
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** Aggregate escrow state across the demo set. */
function EscrowOverview() {
  const totals = mockProjects.reduce(
    (acc, project) => ({
      locked: acc.locked + BigInt(project.escrow.locked || '0'),
      released: acc.released + BigInt(project.escrow.totalReleased || '0'),
      refunded: acc.refunded + BigInt(project.escrow.totalRefunded || '0'),
    }),
    { locked: 0n, released: 0n, refunded: 0n },
  );

  const total = totals.locked + totals.released + totals.refunded;
  const lockedShare = percentOf(totals.locked, total);
  const releasedShare = percentOf(totals.released, total);

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="font-display text-headline-sm text-on-surface">Escrow Position</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Where committed capital currently sits, across all demo projects.
        </p>
      </div>

      <div className="flex-col gap-space-md p-space-md">
        <SegmentedProgress
          total={100}
          segments={[
            { value: lockedShare, className: 'bg-primary', label: `Locked in escrow ${lockedShare.toFixed(1)}%` },
            { value: releasedShare, className: 'bg-secondary', label: `Released to founders ${releasedShare.toFixed(1)}%` },
            {
              value: 100 - lockedShare - releasedShare,
              className: 'bg-outline-variant',
              label: 'Refunded',
            },
          ]}
        />

        <dl className="grid-cols-3 gap-space-sm font-mono text-label-sm">
          <div>
            <dt className="text-outline">Locked</dt>
            <dd className="tabular text-primary">{weiToEthTrimmed(totals.locked, 2)} ETH</dd>
          </div>
          <div>
            <dt className="text-outline">Released</dt>
            <dd className="tabular text-secondary">{weiToEthTrimmed(totals.released, 2)} ETH</dd>
          </div>
          <div>
            <dt className="text-outline">Refunded</dt>
            <dd className="tabular text-on-surface">{weiToEthTrimmed(totals.refunded, 2)} ETH</dd>
          </div>
        </dl>

        <ul className="flex-col gap-1 font-mono text-label-sm text-on-surface-variant">
          {mockProjects.map((project) => (
            <li key={project.id} className="flex items-center justify-between gap-space-sm">
              <span className="truncate">{project.title}</span>
              <span className="flex shrink-0 items-center gap-space-sm">
                <span className="text-outline">{projectStatus(project.status).label}</span>
                <span className="tabular text-on-surface">
                  {weiToEthTrimmed(project.escrow.locked, 2)} ETH locked
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function GovernancePage() {
  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <div className="mb-1 flex-wrap items-center gap-space-sm">
            <span className="rounded bg-tertiary/10 px-2 py-0.5 font-mono text-label-sm uppercase tracking-wider text-tertiary">
              Protocol Oversight
            </span>
            <span className="flex items-center gap-1 font-mono text-label-sm text-on-surface-variant">
              <StatusDot tone="warn" />
              Privileged surface
            </span>
          </div>

          <h1 className="font-display text-headline-lg tracking-tight text-on-surface">
            Governance &amp; Oracle Oversight
          </h1>
          <p className="mt-2 max-w-3xl text-body-md text-on-surface-variant">
            Administering milestone disputes, transfer freezes and role assignment.
            Everything on this page is a capability held by a specific role in the
            contracts — it is centralised authority, not decentralised consensus,
            and it is documented here rather than obscured.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-space-lg px-space-lg py-space-lg lg:grid-cols-3 lg:px-margin">
        <div className="flex flex-col gap-space-lg lg:col-span-2">
          <OversightQueue />
          <PrivilegedSurface />
        </div>

        <div className="flex flex-col gap-space-lg">
          <EscrowOverview />
          <DeploymentPanel />
        </div>
      </div>
    </>
  );
}
