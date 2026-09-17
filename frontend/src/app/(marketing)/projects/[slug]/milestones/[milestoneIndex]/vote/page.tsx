import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import {
  EvidenceList,
  QuorumMeter,
  VotingDesk,
} from '@/components/project/milestone-vote-panel';
import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { getProjectBySlug, mockProjects } from '@/lib/data/mock';
import {
  formatDate,
  formatEthNumber,
  formatCountdown,
  shortenAddress,
} from '@/lib/format';
import { milestoneStatus } from '@/lib/status';

interface PageProps {
  params: Promise<{ slug: string; milestoneIndex: string }>;
}

export function generateStaticParams() {
  return mockProjects.flatMap((project) =>
    project.milestones.map((_, i) => ({
      slug: project.slug,
      milestoneIndex: String(i),
    })),
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, milestoneIndex } = await params;
  const project = getProjectBySlug(slug);
  const milestone = project?.milestones[Number(milestoneIndex)];
  return {
    title: milestone
      ? `Vote: ${milestone.title} — ${project?.title}`
      : 'Milestone vote',
    description: milestone
      ? `Review manufacturer evidence and cast your on-chain vote to release the escrow tranche for "${milestone.title}".`
      : undefined,
  };
}

/**
 * Milestone Escrow Voting & Consensus Terminal (Screen 06).
 *
 * Backers inspect manufacturer-submitted production evidence and cast
 * weighted votes that determine whether the escrow tranche is released to
 * the founder. All vote math mirrors MilestoneEscrow.sol exactly.
 */
export default async function MilestoneVotePage({ params }: PageProps) {
  const { slug, milestoneIndex } = await params;
  const project = getProjectBySlug(slug);
  if (!project) notFound();

  const idx = Number(milestoneIndex);
  const milestone = project.milestones[idx];
  if (!milestone) notFound();

  const status = milestoneStatus(milestone.status);
  const isActive = milestone.status === 'EVIDENCE';

  // Check for Stylus attestation root (field added on-chain after HardwareVerifier call)
  const stylusAttested = Boolean((milestone as Record<string, unknown>).stylusAttestedRoot);

  return (
    <>
      {/* ── Header strip ─────────────────────────────────────────── */}
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <nav
            aria-label="Breadcrumb"
            className="mb-space-sm flex flex-wrap items-center gap-1.5 font-mono text-label-sm text-outline"
          >
            <Link href="/explore" className="transition-colors hover:text-primary">
              Explore
            </Link>
            <Icon name="chevron_right" size={14} />
            <Link
              href={`/projects/${project.slug}`}
              className="transition-colors hover:text-primary"
            >
              {project.title}
            </Link>
            <Icon name="chevron_right" size={14} />
            <span className="text-on-surface">Milestone {idx + 1} Review</span>
          </nav>

          <div className="flex flex-wrap items-start justify-between gap-space-md">
            <div>
              <h1 className="font-display text-headline-md text-on-surface">
                {milestone.title}
              </h1>
              <p className="mt-1 max-w-prose text-body-md text-on-surface-variant">
                {milestone.description}
              </p>
            </div>

            {/* Status + Stylus Oracle badge cluster */}
            <div className="flex flex-wrap items-center gap-space-sm">
              <Badge tone={status.tone}>
                <StatusDot tone={status.tone === 'brand' ? 'brand' : 'neutral'} pulse={isActive} />
                {status.label}
              </Badge>

              {stylusAttested ? (
                <Badge tone="info">
                  <Icon name="verified" size={12} className="mr-1" />
                  Stylus Verified
                </Badge>
              ) : (
                <Badge tone="neutral">
                  <Icon name="pending" size={12} className="mr-1" />
                  Stylus Attestation Pending
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-space-lg py-space-xl lg:px-margin">
        {/* Arbitrum Stylus context banner */}
        <div className="mb-space-lg flex items-start gap-space-sm rounded-lg border border-secondary/30 bg-surface-container-low p-space-md">
          <Icon name="settings_ethernet" size={18} className="mt-0.5 shrink-0 text-secondary" />
          <div className="font-mono text-label-sm">
            <span className="uppercase tracking-wider text-secondary">
              Arbitrum Stylus — HardwareVerifier
            </span>
            <p className="mt-1 text-on-surface-variant">
              Evidence CIDs are attested by the{' '}
              <span className="text-secondary">HardwareVerifier</span> Rust contract deployed to
              Arbitrum Sepolia via Stylus. The contract executes Merkle proof verification at
              near-native WASM speed, emitting a{' '}
              <code className="rounded bg-surface-container-highest px-1 text-primary">
                HardwareBatchVerified
              </code>{' '}
              event before the voting window opens.
            </p>
          </div>
        </div>

        <div className="grid gap-space-lg lg:grid-cols-[1fr_400px]">
          {/* ── LEFT: Evidence & Context ─────────────────────────── */}
          <div className="flex flex-col gap-space-lg">
            {/* Evidence list */}
            <section>
              <h2 className="mb-space-sm font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                Submitted Evidence
              </h2>
              <EvidenceList milestone={milestone} />
            </section>

            {/* Quorum meter — full width here on left on mobile */}
            <QuorumMeter milestone={milestone} />

            {/* Manufacturer context */}
            <section className="rounded-lg border border-outline-variant/40 bg-surface-container">
              <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
                <h2 className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                  Manufacturer Details
                </h2>
              </div>
              <dl className="grid grid-cols-2 gap-px bg-outline-variant/20 font-mono text-label-sm">
                {[
                  { label: 'Project', value: project.title },
                  { label: 'Founder', value: shortenAddress(project.founder) },
                  { label: 'Location', value: project.manufacturingLocation },
                  { label: 'Evidence submitted', value: milestone.evidence[0]?.submittedAt ? formatDate(milestone.evidence[0].submittedAt) : '—' },
                  { label: 'Tranche at stake', value: `${formatEthNumber(milestone.trancheAmount, 2)} ETH` },
                  { label: 'Voting window', value: milestone.votingEndsAt ? formatCountdown(milestone.votingEndsAt) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col gap-0.5 bg-surface-container px-space-md py-space-sm">
                    <dt className="text-outline">{label}</dt>
                    <dd className="text-on-surface">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          {/* ── RIGHT: Voting execution desk + tranche card ──────── */}
          <div className="flex flex-col gap-space-lg">
            <VotingDesk
              milestone={milestone}
              eligibleWeight={milestone.votes.eligible}
              canVote={false}
              hasVoted={false}
              pending={false}
            />

            {/* Escrow Tranche Card */}
            <section className="rounded-lg border border-outline-variant/40 bg-surface-container">
              <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
                <h2 className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                  Escrow Tranche
                </h2>
              </div>
              <div className="flex flex-col gap-space-sm p-space-md font-mono">
                <div className="flex items-baseline justify-between">
                  <span className="text-label-sm text-outline">At stake</span>
                  <span className="text-headline-sm tabular text-primary">
                    {formatEthNumber(milestone.trancheAmount, 2)} ETH
                  </span>
                </div>
                <div className="flex items-center justify-between text-label-sm">
                  <span className="text-outline">Milestone status</span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                {milestone.votingEndsAt && (
                  <div className="flex items-center justify-between text-label-sm">
                    <span className="text-outline">Voting closes</span>
                    <span className="text-on-surface">{formatDate(milestone.votingEndsAt)}</span>
                  </div>
                )}
                {milestone.approvedAt && (
                  <div className="flex items-center justify-between text-label-sm">
                    <span className="text-outline">Released on</span>
                    <span className="text-primary">{formatDate(milestone.approvedAt)}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Settlement card */}
            <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-space-md font-mono text-label-sm text-on-surface-variant">
              <div className="mb-space-xs flex items-center gap-space-sm font-label-md uppercase tracking-wider text-outline">
                <Icon name="gavel" size={14} />
                Permissionless Settlement
              </div>
              <p>
                Once the voting window closes, anyone may call{' '}
                <code className="rounded bg-surface-container-highest px-1 text-on-surface">
                  settleReview()
                </code>{' '}
                on{' '}
                <code className="rounded bg-surface-container-highest px-1 text-secondary">
                  MilestoneEscrow.sol
                </code>{' '}
                on Arbitrum Sepolia. The contract tallies on-chain votes and either releases the
                tranche to the founder or keeps capital locked.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

