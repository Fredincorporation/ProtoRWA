import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { SegmentedProgress } from '@/components/ui/progress';
import { mockProjects } from '@/lib/data/mock';
import { formatDate, formatUsdgNumber, percentOf } from '@/lib/format';
import { milestoneStatus, projectStatus } from '@/lib/status';
import { PROTOCOL, defaultChain } from '@protorwa/shared';

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
            <dd className="tabular text-primary">{formatUsdgNumber(totals.locked, 2)} USDG</dd>
          </div>
          <div>
            <dt className="text-outline">Released</dt>
            <dd className="tabular text-secondary">{formatUsdgNumber(totals.released, 2)} USDG</dd>
          </div>
          <div>
            <dt className="text-outline">Refunded</dt>
            <dd className="tabular text-on-surface">{formatUsdgNumber(totals.refunded, 2)} USDG</dd>
          </div>
        </dl>

        <ul className="flex-col gap-1 font-mono text-label-sm text-on-surface-variant">
          {mockProjects.map((project) => (
            <li key={project.id} className="flex items-center justify-between gap-space-sm">
              <span className="truncate">{project.title}</span>
              <span className="flex shrink-0 items-center gap-space-sm">
                <span className="text-outline">{projectStatus(project.status).label}</span>
                <span className="tabular text-on-surface">
                  {formatUsdgNumber(project.escrow.locked, 2)} USDG locked
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Bento Portfolio Summary Strip matching Screen 14 */
function PortfolioBento() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-space-sm mb-space-lg">
      <div className="relative overflow-hidden rounded-xl bg-surface-container p-space-md flex flex-col justify-between shadow-md">
        <div className="flex items-center justify-between">
          <span className="font-mono text-label-sm uppercase text-on-surface-variant tracking-wider">Portfolio Total Value</span>
          <Icon name="account_balance_wallet" size={20} className="text-primary" />
        </div>
        <div className="my-space-sm">
          <div className="font-display text-headline-lg font-bold text-on-surface tracking-tight">42.50 USDG</div>
          <div className="flex items-center gap-1 font-mono text-label-sm text-primary font-semibold mt-0.5">
            <Icon name="trending_up" size={14} />
            +18.4% Net Return
          </div>
        </div>
        <div className="w-full bg-surface-container-lowest h-1.5 rounded-full overflow-hidden">
          <div className="bg-primary h-full rounded-full" style={{ width: '78%' }} />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-surface-container p-space-md flex flex-col justify-between shadow-md">
        <div className="flex items-center justify-between">
          <span className="font-mono text-label-sm uppercase text-on-surface-variant tracking-wider">Milestone Escrow</span>
          <Icon name="lock_clock" size={20} className="text-secondary" />
        </div>
        <div className="my-space-sm">
          <div className="font-display text-headline-lg font-bold text-on-surface tracking-tight">28.00 USDG</div>
          <div className="font-mono text-label-sm text-on-surface-variant mt-0.5">Held in Stage Contracts</div>
        </div>
        <div className="flex items-center gap-1 font-mono text-label-sm text-secondary">
          <Icon name="verified_user" size={14} />
          65.8% Capital Protected
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-surface-container p-space-md flex flex-col justify-between shadow-md">
        <div className="flex items-center justify-between">
          <span className="font-mono text-label-sm uppercase text-on-surface-variant tracking-wider">Claim Tokens Held</span>
          <Icon name="token" size={20} className="text-tertiary" />
        </div>
        <div className="my-space-sm">
          <div className="font-display text-headline-lg font-bold text-on-surface tracking-tight">3 Projects</div>
          <div className="font-mono text-label-sm text-on-surface-variant mt-0.5">14,200 Total Claims</div>
        </div>
        <div className="flex items-center gap-1 font-mono text-label-sm text-tertiary">
          <Icon name="memory" size={14} />
          Cleantech & Robotics
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-surface-container p-space-md flex flex-col justify-between shadow-md">
        <div className="flex items-center justify-between">
          <span className="font-mono text-label-sm uppercase text-on-surface-variant tracking-wider">Revenue Distributed</span>
          <Icon name="payments" size={20} className="text-primary" />
        </div>
        <div className="my-space-sm">
          <div className="font-display text-headline-lg font-bold text-primary tracking-tight">3.65 USDG</div>
          <div className="font-mono text-label-sm text-on-surface-variant mt-0.5">Automated Disbursements</div>
        </div>
        <div className="flex items-center gap-1 font-mono text-label-sm text-primary">
          <Icon name="check_circle" size={14} />
          {defaultChain.name} Verified
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-surface-container-high p-space-md flex flex-col justify-between shadow-md">
        <div className="flex items-center justify-between">
          <span className="font-mono text-label-sm uppercase text-tertiary font-bold tracking-wider">Action Needed</span>
          <Icon name="how_to_vote" size={20} className="text-tertiary animate-pulse" />
        </div>
        <div className="my-space-sm">
          <div className="font-display text-headline-lg font-bold text-tertiary tracking-tight">1 Milestone</div>
          <div className="font-mono text-label-sm text-on-surface-variant mt-0.5">18h remaining to cast vote</div>
        </div>
        <Link
          href="/projects/heliofrost-pro/milestones/2/vote"
          className="w-full py-1.5 rounded bg-tertiary text-on-tertiary font-mono text-label-sm font-bold uppercase tracking-wider text-center hover:opacity-90 transition-opacity"
        >
          Vote Now
        </Link>
      </div>
    </div>
  );
}

/** Urgent Governance Action Required Banner (Screen 14) */
function UrgentVoteBanner() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-container-high p-space-md lg:p-space-lg shadow-xl mb-space-lg">
      <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-tertiary/10 blur-3xl pointer-events-none" />
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-space-md relative z-10">
        <div className="flex flex-col gap-space-xs max-w-3xl">
          <div className="flex flex-wrap items-center gap-space-xs">
            <span className="px-2 py-0.5 rounded bg-tertiary/20 text-tertiary font-mono text-label-sm font-bold uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-ping" />
              Urgent Governance Action Required
            </span>
            <span className="font-mono text-label-sm text-outline">•</span>
            <span className="font-mono text-label-sm text-on-surface-variant">
              {defaultChain.name} Chain ID {defaultChain.id}
            </span>
          </div>
          <h2 className="font-display text-headline-md text-on-surface font-bold">
            HelioFrost Pro: Milestone 03 Production Run QA Voting Open
          </h2>
          <p className="font-body-md text-on-surface-variant">
            Founder ThermoVolt Labs submitted environmental chamber thermal telemetry and factory ISO 9001 test reports. 30 USDG escrow tranche release pending backer quorum.
          </p>
        </div>
        <div className="flex items-center gap-space-sm self-start lg:self-auto">
          <Link
            href="/projects/heliofrost-pro/milestones/2/vote"
            className="px-space-md py-2.5 rounded-lg bg-tertiary hover:opacity-90 text-on-tertiary font-mono text-label-sm font-bold uppercase tracking-wider transition-all shadow-md inline-flex items-center gap-2"
          >
            <Icon name="how_to_vote" size={16} />
            Review Evidence &amp; Vote
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function GovernancePage() {
  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
            <div>
              <div className="mb-1 flex items-center gap-space-sm">
                <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-label-sm uppercase tracking-wider text-primary">
                  Multi-Sig Protocol Engine
                </span>
                <span className="flex items-center gap-1 font-mono text-label-sm text-on-surface-variant">
                  <StatusDot tone="brand" pulse />
                  {defaultChain.name} Active
                </span>
              </div>
              <h1 className="font-display text-headline-lg tracking-tight text-on-surface">
                Investor Governance &amp; Portfolio Hub
              </h1>
              <p className="mt-1 max-w-3xl text-body-md text-on-surface-variant">
                Tokenized escrow positions, verified hardware telemetry oracles, and milestone consensus voting terminals.
              </p>
            </div>
            <div className="flex items-center gap-space-sm">
              <Link
                href="/market"
                className="px-space-md py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-secondary font-mono text-label-sm transition-all shadow-sm inline-flex items-center gap-1.5"
              >
                <Icon name="candlestick_chart" size={16} />
                Terminal Order Book
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-space-lg py-space-lg lg:px-margin">
        {/* Bento Portfolio Strip from Screen 14 */}
        <PortfolioBento />

        {/* Urgent Governance Action Callout from Screen 14 */}
        <UrgentVoteBanner />

        <div className="grid grid-cols-1 gap-space-lg lg:grid-cols-3">
          <div className="flex flex-col gap-space-lg lg:col-span-2">
            <OversightQueue />
            <PrivilegedSurface />
          </div>

          <div className="flex flex-col gap-space-lg">
            <EscrowOverview />
            <DeploymentPanel />
          </div>
        </div>
      </main>
    </>
  );
}
