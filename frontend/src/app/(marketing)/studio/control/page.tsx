'use client';

import * as React from 'react';
import Link from 'next/link';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { SegmentedProgress } from '@/components/ui/progress';
import { useOnboarding } from '@/components/onboarding/onboarding-dialog';
import { demoViewer, mockProjects } from '@/lib/data/mock';
import {
  formatCountdown,
  formatDate,
  formatUsdgNumber,
  formatNumber,
  percentOf,
  shortenAddress,
} from '@/lib/format';
import { milestoneStatus, projectStatus } from '@/lib/status';
import { cn } from '@/lib/utils';
import { PROTOCOL, getChain, getContracts } from '@protorwa/shared';
import { useChainId } from 'wagmi';
import type { Milestone, Project } from '@protorwa/shared';

/**
 * Founder Dashboard: Hardware Production & Escrow Control (/studio/control).
 *
 * The question this screen answers is "where is my money, and what is blocking
 * the next release". /studio lists the projects; this is the control surface for
 * a single one - which tranche is locked, what evidence a milestone still needs,
 * and what the founder has to do to unlock it.
 *
 * Gating: the founder persona or an operator. A backer has no business here, and
 * the nav link is hidden for them - but the page checks too, because a hidden
 * link is not access control.
 *
 * Writes: the evidence links route into the live submission studio, which is
 * already wired to `submitEvidence()` for registry projects and self-gates on the
 * founder wallet and the project's demo/live provenance. This page itself stays a
 * read-only control overview; it does not duplicate those write forms.
 */

/** Derived per-project escrow status, computed once per render. */
interface EscrowStatus {
  locked: bigint;
  released: bigint;
  refunded: bigint;
  total: bigint;
  target: bigint;
  /** Percentage of the funding target covered. */
  fundedPct: number;
  /** Next milestone that can still be acted on. */
  next: Milestone | null;
  /** Milestones the founder can submit evidence for right now. */
  actionable: Milestone[];
}

function deriveEscrowStatus(project: Project): EscrowStatus {
  const locked = BigInt(project.escrow.locked || '0');
  const released = BigInt(project.escrow.totalReleased || '0');
  const refunded = BigInt(project.escrow.totalRefunded || '0');
  const target = BigInt(project.escrow.target || '0');

  const committed = BigInt(project.escrow.totalCommitted || '0');

  return {
    locked,
    released,
    refunded,
    total: locked + released + refunded,
    target,
    fundedPct: percentOf(committed, target > 0n ? target : 1n),
    next: project.milestones.find((m) => m.status === 'PENDING') ?? null,
    /*
     * A milestone is actionable when it is PENDING (evidence not yet submitted)
     * or REJECTED (consensus refused it and the founder may resubmit). EVIDENCE
     * is mid-vote, so there is nothing to submit.
     */
    actionable: project.milestones.filter((m) => m.status === 'PENDING' || m.status === 'REJECTED'),
  };
}

/* ------------------------------------------------------------------ *
 * Panels
 * ------------------------------------------------------------------ */

/** Project selector: one control surface per project. */
function ProjectSelector({
  projects,
  selectedId,
  onSelect,
}: {
  projects: Project[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border-outline-variant/40 bg-surface-container-low p-1">
      {projects.map((project) => {
        const status = projectStatus(project.status);
        const active = project.id === selectedId;
        return (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelect(project.id)}
            aria-pressed={active}
            className={cn(
              'flex items-center gap-2 rounded px-space-sm py-1.5 font-mono text-label-sm transition-colors',
              active
                ? 'bg-primary font-semibold text-on-primary'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
            )}
          >
            <StatusDot tone={active ? 'brand' : 'neutral'} />
            {project.title}
            <span className={cn('text-label-sm', active ? 'text-on-primary/70' : 'text-outline')}>
              {status.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Escrow position for the selected project. */
function EscrowPanel({ status, project }: { status: EscrowStatus; project: Project }) {
  const lockedPct = percentOf(status.locked, status.total > 0n ? status.total : 1n);
  const releasedPct = percentOf(status.released, status.total > 0n ? status.total : 1n);

  const tiles = [
    {
      label: 'Still in escrow',
      value: `${formatUsdgNumber(status.locked, 4)} USDG`,
      sub: 'Not yet released to you',
      tone: 'text-primary',
      icon: 'lock',
    },
    {
      label: 'Released to you',
      value: `${formatUsdgNumber(status.released, 4)} USDG`,
      sub: 'Across approved milestones',
      tone: 'text-secondary',
      icon: 'lock_open',
    },
    {
      label: 'Funding target',
      value: `${formatUsdgNumber(status.target, 4)} USDG`,
      sub: `${status.fundedPct.toFixed(1)}% committed`,
      tone: 'text-on-surface',
      icon: 'savings',
    },
    {
      label: 'Refunded to backers',
      value: `${formatUsdgNumber(status.refunded, 4)} USDG`,
      sub: status.refunded > 0n ? 'Reduced your release' : 'None',
      tone: 'text-on-surface',
      icon: 'currency_exchange',
    },
  ];

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="flex flex-wrap items-center justify-between gap-space-sm border-b border-outline-variant/40 px-space-md py-space-sm">
        <div>
          <h2 className="font-display text-headline-sm text-on-surface">Escrow position</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            {project.title} · tranches release only when backers approve a milestone.
          </p>
        </div>
        <Badge tone={projectStatus(project.status).tone}>
          <StatusDot tone="brand" pulse={project.status === 'IN_PRODUCTION'} />
          {projectStatus(project.status).label}
        </Badge>
      </div>

      <div className="flex flex-col gap-space-md p-space-md">
        <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="flex flex-col gap-0.5 rounded-lg bg-surface-container-lowest p-space-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-label-sm uppercase tracking-wider text-outline">
                  {tile.label}
                </span>
                <Icon name={tile.icon} size={15} className="text-outline" />
              </div>
              <span className={cn('font-display text-headline-sm tabular', tile.tone)}>
                {tile.value}
              </span>
              <span className="font-mono text-label-sm text-outline">{tile.sub}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-label-sm uppercase tracking-wider text-outline">
            Where the committed capital sits
          </span>
          <SegmentedProgress
            total={100}
            segments={[
              { value: lockedPct, className: 'bg-primary', label: `Locked ${lockedPct.toFixed(1)}%` },
              {
                value: releasedPct,
                className: 'bg-secondary',
                label: `Released ${releasedPct.toFixed(1)}%`,
              },
              {
                value: Math.max(0, 100 - lockedPct - releasedPct),
                className: 'bg-outline-variant',
                label: 'Refunded',
              },
            ]}
          />
        </div>
      </div>
    </section>
  );
}

/** The milestone pipeline, with what each one is waiting on. */
function MilestonePipeline({ project, status }: { project: Project; status: EscrowStatus }) {
  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="flex flex-wrap items-center justify-between gap-space-sm border-b border-outline-variant/40 px-space-md py-space-sm">
        <div>
          <h2 className="font-display text-headline-sm text-on-surface">Milestone pipeline</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Each tranche unlocks only on backer approval. Submitting evidence opens the
            review window; it does not release anything by itself.
          </p>
        </div>
        <Badge tone={status.actionable.length > 0 ? 'warn' : 'neutral'}>
          <StatusDot tone={status.actionable.length > 0 ? 'warn' : 'neutral'} pulse={status.actionable.length > 0} />
          {status.actionable.length} awaiting your action
        </Badge>
      </div>

      <ol className="flex-col">
        {project.milestones.map((milestone) => {
          const ms = milestoneStatus(milestone.status);
          const eligible = BigInt(milestone.votes.eligible || '0');
          const approve = percentOf(BigInt(milestone.votes.approve || '0'), eligible);
          const reject = percentOf(BigInt(milestone.votes.reject || '0'), eligible);
          const abstain = percentOf(BigInt(milestone.votes.abstain || '0'), eligible);

          const canSubmit = milestone.status === 'PENDING' || milestone.status === 'REJECTED';

          return (
            <li
              key={milestone.index}
              className="flex flex-col gap-space-sm border-b border-outline-variant/20 p-space-md last:border-0"
            >
              <div className="flex flex-wrap items-start justify-between gap-space-sm">
                <div className="flex items-start gap-space-sm">
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded font-mono text-label-sm',
                      milestone.status === 'APPROVED'
                        ? 'bg-primary/15 text-primary'
                        : milestone.status === 'EVIDENCE'
                          ? 'bg-secondary/15 text-secondary'
                          : milestone.status === 'REJECTED'
                            ? 'bg-error/15 text-error'
                            : 'bg-surface-container-highest text-outline',
                    )}
                  >
                    {String(milestone.index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <span className="font-display text-headline-sm text-on-surface">
                        {milestone.title}
                      </span>
                      <Badge tone={ms.tone}>
                        <StatusDot
                          tone={
                            milestone.status === 'EVIDENCE'
                              ? 'accent'
                              : milestone.status === 'APPROVED'
                                ? 'brand'
                                : milestone.status === 'REJECTED'
                                  ? 'danger'
                                  : 'neutral'
                          }
                          pulse={milestone.status === 'EVIDENCE'}
                        />
                        {ms.label}
                      </Badge>
                    </div>
                    <p className="mt-1 max-w-prose text-body-sm text-on-surface-variant">
                      {milestone.description}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono text-label-sm text-outline">Tranche</div>
                  <div className="font-mono tabular text-secondary">
                    {formatUsdgNumber(milestone.trancheAmount, 4)} USDG
                  </div>
                </div>
              </div>

              {/* Vote tally, only meaningful once evidence exists. */}
              {milestone.status !== 'PENDING' ? (
                <SegmentedProgress
                  total={100}
                  segments={[
                    { value: approve, className: 'bg-primary', label: `Approve ${approve.toFixed(1)}%` },
                    { value: reject, className: 'bg-error', label: `Reject ${reject.toFixed(1)}%` },
                    { value: abstain, className: 'bg-outline', label: `Abstain ${abstain.toFixed(1)}%` },
                  ]}
                />
              ) : null}

              <div className="flex flex-wrap items-center gap-space-md font-mono text-label-sm text-outline">
                <span>Due {formatDate(milestone.dueAt)}</span>
                <span>
                  Quorum {milestone.quorumBps / 100}% · approval{' '}
                  {milestone.approvalThresholdBps / 100}%
                </span>
                {milestone.votingEndsAt ? (
                  <span className="text-secondary">
                    Review {formatCountdown(milestone.votingEndsAt)}
                  </span>
                ) : null}
                {milestone.approvedAt ? (
                  <span className="text-primary">Released {formatDate(milestone.approvedAt)}</span>
                ) : null}
              </div>

              {/* Evidence already attached. */}
              {milestone.evidence.length > 0 ? (
                <ul className="flex flex-wrap gap-space-xs">
                  {milestone.evidence.map((item) => (
                    <li
                      key={item.id}
                      className="inline-flex items-center gap-1.5 rounded border-outline-variant/40 bg-surface-container-lowest px-2 py-1 font-mono text-label-sm text-on-surface-variant"
                    >
                      <Icon name="description" size={13} className="text-secondary" />
                      {item.label}
                      <span className="text-outline">{item.mimeType}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* The founder's actual next move, or why it is blocked. */}
              <div className="flex flex-wrap items-center gap-space-sm border-t border-outline-variant/20 pt-space-sm">
                {canSubmit ? (
                  <Link
                    href={`/studio/${project.slug}/milestones/${milestone.index}/submit`}
                    className="inline-flex items-center gap-1.5 rounded border-primary/40 bg-primary/10 px-space-sm py-1.5 font-mono text-label-sm text-primary transition-colors hover:bg-primary/20"
                  >
                    <Icon name="upload" size={14} />
                    {milestone.status === 'REJECTED' ? 'Resubmit evidence' : 'Submit evidence'}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-mono text-label-sm text-outline">
                    <Icon name={milestone.status === 'EVIDENCE' ? 'hourglass_top' : 'lock'} size={14} />
                    {milestone.status === 'EVIDENCE'
                      ? 'Awaiting backer vote — nothing to submit'
                      : 'Complete — tranche released'}
                  </span>
                )}

                {milestone.status === 'EVIDENCE' ? (
                  <span className="font-mono text-label-sm text-outline">
                    Settlement is permissionless once the window closes.
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Hardware attestation state: what the Stylus verifier has and has not seen. */
function HardwareAttestation() {
  /**
   * Verifier address from the chain registry, not a hardcoded env var.
   *
   * This previously read NEXT_PUBLIC_ARB_SEPOLIA_HARDWARE_VERIFIER directly, so
   * the panel reported "not configured" on every other chain - including the
   * Robinhood deployment, which is the one that matters for the Stylus story.
   * `useChainId` makes it follow whatever the wallet is actually connected to.
   */
  const chainId = useChainId();
  const verifier = getContracts(chainId).hardwareVerifier;
  const activeChain = getChain(chainId);

  return (
    <section className="rounded-lg border-secondary/30 bg-surface-container-low">
      <div className="flex items-center gap-space-sm border-b border-secondary/20 px-space-md py-space-sm">
        <Icon name="settings_ethernet" size={16} className="text-secondary" />
        <h2 className="font-mono text-label-md uppercase tracking-wider text-secondary">
          Hardware attestation
        </h2>
      </div>

      <div className="flex flex-col gap-space-sm p-space-md font-mono text-label-sm">
        <div className="flex items-center justify-between">
          <span className="text-outline">Chain</span>
          <span className="text-on-surface">
            {activeChain ? `${activeChain.name} (${activeChain.id})` : `Chain ${chainId}`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-outline">Verifier</span>
          <span className="text-on-surface">
            {verifier ? `${verifier.slice(0, 10)}…${verifier.slice(-6)}` : 'not configured'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-outline">Runtime</span>
          <span className="text-secondary">Stylus (Rust → WASM)</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-outline">Evidence digest</span>
          <span className="text-on-surface-variant">
            computed per submission, not stored here
          </span>
        </div>

        <p className="border-t border-secondary/20 pt-space-sm text-on-surface-variant">
          On this deployment the verifier is used two ways. When a founder submits milestone
          evidence, the escrow calls{' '}
          <code className="rounded bg-surface-container-highest px-1 text-primary">
            verifyHardwareBatch
          </code>{' '}
          and only opens the review if the Merkle proof matches the root committed beforehand. It is
          also read live to{' '}
          <span className="text-on-surface">predict the consensus outcome</span> that{' '}
          <code className="rounded bg-surface-container-highest px-1 text-primary">
            settleReview()
          </code>{' '}
          will reach. It attests that the submitted package matches the committed root — it does not
          certify the hardware is good, and no auditor has inspected it in this demo.
        </p>
      </div>
    </section>
  );
}

/** Founder identity and the escrow it controls. */
function FounderIdentityPanel({ project }: { project: Project }) {
  const isDemoFounder =
    project.founder.toLowerCase() === demoViewer.address.toLowerCase();

  return (
    <section className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
      <div className="flex items-center gap-space-sm">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
          <Icon name="precision_manufacturing" size={20} />
        </span>
        <div className="flex flex-col">
          <span className="font-mono text-label-md font-bold text-on-surface">
            {shortenAddress(project.founder, 6)}
          </span>
          <span className="font-mono text-label-sm text-outline">
            {project.founderHandle ? `@${project.founderHandle}` : 'no handle'} · project founder
          </span>
        </div>
      </div>

      <dl className="mt-space-md flex-col gap-space-xs font-mono text-label-sm">
        <div className="flex items-center justify-between">
          <dt className="text-outline">Facility</dt>
          <dd className="text-on-surface">{project.manufacturingLocation}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-outline">Created</dt>
          <dd className="text-on-surface">{formatDate(project.createdAt)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-outline">Claim units</dt>
          <dd className="tabular text-on-surface">
            {formatNumber(project.claimsCommitted)} / {formatNumber(project.totalClaims)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-outline">Fee on secondary</dt>
          <dd className="tabular text-on-surface">{PROTOCOL.SECONDARY_FEE_BPS / 100}%</dd>
        </div>
      </dl>

      {isDemoFounder ? (
        <p className="mt-space-sm border-t border-outline-variant/20 pt-space-sm font-mono text-label-sm text-primary">
          This demo viewer address is the registered founder for this project.
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Access gate
 * ------------------------------------------------------------------ */

function AccessDenied() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-space-md px-space-lg text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-error/10 text-error">
        <Icon name="gpp_maybe" size={28} />
      </div>
      <h1 className="font-display text-headline-md text-on-surface">Founder access required</h1>
      <p className="max-w-prose text-body-md text-on-surface-variant">
        Escrow control covers capital held on behalf of backers: tranche release, evidence
        submission and production updates. It is available to the founder persona and to
        protocol operators.
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
 * Page
 * ------------------------------------------------------------------ */

export default function StudioControlPage() {
  const { role, isOperator } = useOnboarding();
  const permitted = role === 'founder' || role === 'admin' || isOperator;

  const [selectedId, setSelectedId] = React.useState(mockProjects[0]?.id ?? '1');
  const project = mockProjects.find((candidate) => candidate.id === selectedId) ?? mockProjects[0];

  const status = React.useMemo(
    () => (project ? deriveEscrowStatus(project) : null),
    [project],
  );

  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <nav
            aria-label="Breadcrumb"
            className="mb-space-sm flex items-center gap-1.5 font-mono text-label-sm text-outline"
          >
            <Link href="/studio" className="transition-colors hover:text-primary">
              Studio
            </Link>
            <Icon name="chevron_right" size={14} />
            <span className="text-on-surface">Fleet Control</span>
          </nav>
          <h1 className="font-display text-headline-lg tracking-tight text-on-surface">
            Hardware Production &amp; Escrow Control
          </h1>
          <p className="mt-2 max-w-3xl text-body-md text-on-surface-variant">
            Where the escrowed capital sits, which milestones are holding it, and what
            you have to submit to release the next tranche.
          </p>
        </div>
      </header>

      {!permitted ? (
        <AccessDenied />
      ) : !project || !status ? (
        <div className="flex min-h-[40vh] items-center justify-center font-mono text-label-sm text-outline">
          No project is available to control.
        </div>
      ) : (
        <main className="mx-auto flex max-w-7xl flex-col gap-space-lg px-space-lg py-space-lg lg:px-margin">
          <ProjectSelector
            projects={mockProjects}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          <div className="grid grid-cols-1 gap-space-lg lg:grid-cols-3">
            <div className="flex flex-col gap-space-lg lg:col-span-2">
              <EscrowPanel status={status} project={project} />
              <MilestonePipeline project={project} status={status} />
            </div>

            <div className="flex flex-col gap-space-lg">
              <FounderIdentityPanel project={project} />
              <HardwareAttestation />

              <section className="rounded-lg border-outline-variant/40 bg-surface-container-low p-space-md">
                <div className="mb-space-sm flex items-center gap-1.5 font-mono text-label-sm uppercase tracking-wider text-outline">
                  <Icon name="info" size={14} />
                  How writes work here
                </div>
                <p className="text-body-sm text-on-surface-variant">
                  The evidence links below open the live submission studio, which
                  pins artefacts to IPFS and broadcasts{' '}
                  <code className="rounded bg-surface-container-highest px-1 font-mono text-label-sm text-primary">
                    submitEvidence()
                  </code>{' '}
                  against the deployed escrow for projects published to the registry
                  - enabled only for the connected founder wallet. Rows tagged{' '}
                  <span className="font-mono">demo</span> have no on-chain escrow, so
                  their studio run stays a labelled simulation. Tranche release is not
                  a founder action: it happens when backers approve a milestone (or the
                  oracle resolves a dispute).
                </p>
              </section>
            </div>
          </div>
        </main>
      )}
    </>
  );
}
