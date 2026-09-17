import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import {
  EvidenceList,
  QuorumMeter,
  VotingDesk,
} from '@/components/project/milestone-vote-panel';
import { ProjectMediaShowcase } from '@/components/project/project-media-showcase';
import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import { mockProjects, getProjectBySlug, mockUpdates } from '@/lib/data/mock';
import { getProjectMedia } from '@/lib/project-media';
import { formatDate, formatEthNumber, formatNumber, percentOf, weiToEth } from '@/lib/format';
import { categoryMap, milestoneStatus, projectStatus } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { IndustryCategory, Project } from '@protorwa/shared';

/**
 * Project detail (/projects/[slug]).
 *
 * This is where the protocol's core claim gets demonstrated: capital is held in
 * escrow and each tranche releases only against production evidence approved by
 * claim holders. The layout follows the project terminal designs - summary rail,
 * milestone timeline with evidence, and the voting execution desk.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Pre-renders every demo project at build time. */
export function generateStaticParams() {
  return mockProjects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) return { title: 'Project not found' };
  return {
    title: project.title,
    description: project.tagline,
  };
}

/** Summary rail: the numbers a backer needs before committing. */
function SummaryRail({ project }: { project: Project }) {
  const committed = BigInt(project.escrow.totalCommitted || '0');
  const target = BigInt(project.escrow.target || '0');
  const released = BigInt(project.escrow.totalReleased || '0');
  const locked = BigInt(project.escrow.locked || '0');

  const fundedPct = percentOf(committed, target);
  const releasedPct = percentOf(released, target);

  const rows = [
    { label: 'Funding target', value: `${formatEthNumber(target, 2)} ETH` },
    { label: 'Committed', value: `${formatEthNumber(committed, 2)} ETH` },
    { label: 'Released from escrow', value: `${formatEthNumber(released, 2)} ETH` },
    { label: 'Still locked', value: `${formatEthNumber(locked, 2)} ETH` },
    { label: 'Claim price', value: `${formatEthNumber(project.claimPrice, 4)} ETH` },
    { label: 'Claims committed', value: `${formatNumber(project.claimsCommitted)} / ${formatNumber(project.totalClaims)}` },
    { label: 'Funding deadline', value: formatDate(project.escrow.fundingDeadline) },
  ];

  return (
    <aside className="flex flex-col gap-space-md lg:sticky lg:top-24">
      <div className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
        <div className="flex items-baseline justify-between">
          {/* "Commitments" not "Escrow funded": 100% committed does not mean the
              capital has left escrow, and the released figure sits right below. */}
          <span className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
            Commitments raised
          </span>
          <span className="font-display text-headline-md tabular text-primary">
            {fundedPct.toFixed(1)}%
          </span>
        </div>
        <Progress value={fundedPct} className="mt-space-xs" />
        <div className="mt-space-sm font-mono text-label-sm text-outline">
          {releasedPct.toFixed(1)}% already released against approved milestones
        </div>
      </div>

      <div className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
        <h2 className="mb-space-sm font-mono text-label-md uppercase tracking-wider text-on-surface">
          Project terms
        </h2>
        <dl className="flex flex-col gap-space-xs font-mono text-label-sm">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-space-sm border-b border-outline-variant/20 pb-1 last:border-0"
            >
              <dt className="text-on-surface-variant">{row.label}</dt>
              <dd className="tabular text-on-surface">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
        <h2 className="mb-space-sm font-mono text-label-md uppercase tracking-wider text-on-surface">
          Commit capital
        </h2>
        <p className="mb-space-sm text-body-sm text-on-surface-variant">
          Claims mint on commit and are held as ERC-1155 units. Capital goes to
          escrow, not to the founder.
        </p>
        {project.status === 'FUNDING' ? (
          <Link
            href={`/projects/${project.slug}/invest`}
            className="inline-flex w-full items-center justify-center gap-2 rounded bg-primary px-space-md py-3 font-display text-headline-sm text-on-primary transition-colors hover:bg-primary-fixed"
          >
            <Icon name="account_balance_wallet" size={20} />
            Commit capital
          </Link>
        ) : (
          /*
           * Rendered as a non-interactive element rather than a disabled link:
           * an <a> with aria-disabled still receives focus and still follows the
           * route on activation, so a "disabled" anchor is a real bug, not just
           * a styling choice.
           */
          <p
            aria-disabled
            className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded bg-surface-container-high px-space-md py-3 font-display text-headline-sm text-on-surface-variant"
          >
            <Icon name="lock" size={20} />
            {project.status === 'IN_PRODUCTION' ? 'Raise closed' : 'Not accepting capital'}
          </p>
        )}
      </div>
    </aside>
  );
}

/** Milestone timeline. Each entry shows tranche, status, votes and evidence. */
function MilestoneTimeline({ project }: { project: Project }) {
  return (
    <section id="milestones" className="flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-headline-md uppercase tracking-tight text-on-surface">
          Milestone Escrow
        </h2>
        <span className="font-mono text-label-sm text-outline">
          {project.milestones.filter((m) => m.status === 'APPROVED').length} of{' '}
          {project.milestones.length} released
        </span>
      </div>

      <ol className="flex flex-col gap-space-md">
        {project.milestones.map((milestone) => {
          const status = milestoneStatus(milestone.status);
          const eligible = BigInt(milestone.votes.eligible || '0');
          const approvePct = percentOf(BigInt(milestone.votes.approve || '0'), eligible);

          return (
            <li
              key={milestone.index}
              id={`milestone-${milestone.index}`}
              className="relative rounded-lg border-outline-variant/40 bg-surface-container p-space-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-space-sm">
                <div className="flex items-start gap-space-sm">
                  <span
                    className={cn(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-label-md',
                      milestone.status === 'APPROVED' && 'bg-primary/15 text-primary',
                      milestone.status === 'EVIDENCE' && 'bg-tertiary/15 text-tertiary',
                      milestone.status === 'REJECTED' && 'bg-error/15 text-error',
                      milestone.status === 'PENDING' && 'bg-surface-container-high text-outline',
                      milestone.status === 'DISPUTED' && 'bg-tertiary/15 text-tertiary',
                    )}
                  >
                    {milestone.status === 'APPROVED' ? (
                      <Icon name="check" size={16} />
                    ) : (
                      String(milestone.index + 1).padStart(2, '0')
                    )}
                  </span>
                  <div>
                    <h3 className="font-display text-headline-sm text-on-surface">
                      {milestone.title}
                    </h3>
                    <p className="text-body-sm text-on-surface-variant">
                      {milestone.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-space-sm">
                  <span className="font-mono text-label-md tabular text-secondary">
                    {weiToEth(milestone.trancheAmount)} ETH
                  </span>
                  <Badge tone={status.tone}>
                    <StatusDot tone={status.tone === 'brand' ? 'brand' : 'neutral'} pulse={milestone.status === 'EVIDENCE'} />
                    {status.label}
                  </Badge>
                </div>
              </div>

              <div className="mt-space-sm grid-cols-3 gap-space-sm font-mono text-label-sm">
                <div>
                  <div className="text-outline">Due</div>
                  <div className="text-on-surface">{formatDate(milestone.dueAt)}</div>
                </div>
                <div>
                  <div className="text-outline">Approve</div>
                  <div className="tabular text-on-surface">
                    {milestone.status === 'PENDING' ? '—' : `${approvePct.toFixed(1)}%`}
                  </div>
                </div>
                <div>
                  <div className="text-outline">Threshold</div>
                  <div className="tabular text-on-surface">
                    {milestone.approvalThresholdBps / 100}%
                  </div>
                </div>
              </div>

              {/*
               * Stacked column, not a grid: this wrapper holds the quorum meter
               * above the evidence/desk pair. A previous edit left a
               * `grid-cols-*` here, which split the quorum meter into one of two
               * columns and crushed the desk into a narrow stack.
               */}
              {milestone.status === 'EVIDENCE' ? (
                <div className="mt-space-md flex-col gap-space-sm">
                  <div className="flex justify-end">
                    <Link
                      href={`/projects/${project.slug}/milestones/${milestone.index}/vote`}
                      className="inline-flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-space-sm py-1 font-mono text-label-sm text-primary transition-colors hover:bg-primary/20"
                    >
                      <Icon name="open_in_new" size={14} />
                      Open Full Voting Terminal (Screen 06)
                    </Link>
                  </div>
                  <QuorumMeter milestone={milestone} />
                  <div className="grid grid-cols-1 gap-space-md lg:grid-cols-2">
                    <div>
                      <h4 className="mb-space-xs font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                        Submitted evidence
                      </h4>
                      <EvidenceList milestone={milestone} />
                    </div>
                    <VotingDesk
                      milestone={milestone}
                      eligibleWeight={milestone.votes.eligible}
                      canVote={false}
                      hasVoted={false}
                    />
                  </div>
                </div>
              ) : null}

              {milestone.status === 'APPROVED' && milestone.evidence.length > 0 ? (
                <details className="mt-space-sm">
                  <summary className="cursor-pointer font-mono text-label-sm text-primary hover:underline">
                    View approved evidence ({milestone.evidence.length})
                  </summary>
                  <div className="mt-space-xs">
                    <EvidenceList milestone={milestone} />
                  </div>
                </details>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Founder updates / changelog. */
function UpdatesFeed({ projectId }: { projectId: string }) {
  const updates = mockUpdates.filter((update) => update.projectId === projectId);

  return (
    <section id="updates" className="flex flex-col gap-space-md">
      <h2 className="font-display text-headline-md uppercase tracking-tight text-on-surface">
        Founder Updates
      </h2>
      {updates.length === 0 ? (
        <p className="rounded-lg border-dashed border-outline-variant/40 bg-surface-container p-space-md text-center font-mono text-label-sm text-outline">
          No updates posted yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-space-sm">
          {updates.map((update) => (
            <li
              key={update.id}
              className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md"
            >
              <div className="flex items-center justify-between gap-space-sm">
                <h3 className="font-display text-headline-sm text-on-surface">{update.title}</h3>
                <span className="shrink-0 font-mono text-label-sm text-outline">
                  {formatDate(update.createdAt, { year: undefined, day: '2-digit', month: 'short' })}
                </span>
              </div>
              <p className="mt-space-xs text-body-sm text-on-surface-variant">{update.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ProjectPage({ params }: PageProps) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project) notFound();

  const status = projectStatus(project.status);
  const category = categoryMap[project.category as IndustryCategory];
  const media = getProjectMedia(slug);

  return (
    <>
      {/* Precision Technical Ribbon from Stitch Screen 04 */}
      <div className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-2 lg:px-margin">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-space-sm text-on-surface-variant font-mono text-label-sm">
          <div className="flex items-center gap-space-md">
            <div className="flex items-center gap-1.5">
              <span className="text-outline">DISCOVERY</span>
              <Icon name="chevron_right" size={12} className="text-outline" />
              <span className="text-outline">{category.label.toUpperCase()}</span>
              <Icon name="chevron_right" size={12} className="text-outline" />
              <span className="text-primary font-semibold">
                {project.title.split(/\s+/).map(w => w[0]).join('').slice(0, 5).toUpperCase()}-042
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container-high text-on-surface">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span>ESCROW STATE: ACTIVE ON ARBITRUM SEPOLIA</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`https://sepolia.arbiscan.io/address/${project.escrow.escrowAddress ?? '0x19f2190C1c50B2E4403ff4bd78c05598aBabbD16'}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors"
            >
              <Icon name="open_in_new" size={12} />
              <span>EXPLORER (0x19f2...bD16)</span>
            </a>
          </div>
        </div>
      </div>

      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <nav
            aria-label="Breadcrumb"
            className="mb-space-sm flex items-center gap-1.5 font-mono text-label-sm text-outline"
          >
            <Link href="/explore" className="transition-colors hover:text-primary">
              Explore
            </Link>
            <Icon name="chevron_right" size={14} />
            <span className="text-on-surface-variant">{category.label}</span>
          </nav>

          <div className="flex flex-wrap items-start justify-between gap-space-md">
            <div className="max-w-3xl">
              <div className="mb-space-xs flex items-center gap-space-sm">
                <Badge tone={status.tone}>
                  <StatusDot tone={status.tone === 'brand' ? 'brand' : 'neutral'} pulse={project.status === 'FUNDING'} />
                  {status.label}
                </Badge>
                <span className="inline-flex items-center gap-1 font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
                  <Icon name={category.icon} size={14} />
                  {category.label}
                </span>
              </div>
              <h1 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
                {project.title}
              </h1>
              <p className="mt-2 text-body-lg text-on-surface-variant">{project.tagline}</p>
              {/* Explicit separators: the three spans are inline content, so a
                  flex `gap` has no effect on them. */}
              <div className="mt-space-sm flex-wrap items-center gap-x-3 gap-y-1 font-mono text-label-sm text-outline">
                <span>Founder: {project.founderHandle ?? project.founder.slice(0, 10)}</span>
                <span aria-hidden className="text-outline-variant">
                  ·
                </span>
                <span>Facility: {project.manufacturingLocation}</span>
                <span aria-hidden className="text-outline-variant">
                  ·
                </span>
                <span>Registered {formatDate(project.createdAt)}</span>
              </div>
            </div>

            {/* Quick-action links */}
            <div className="flex flex-wrap items-center gap-space-sm">
              <Link
                href={`/market/${project.title.split(/\s+/).map(w => w[0]).join('').slice(0,6).toLowerCase()}`}
                className="inline-flex items-center gap-1.5 rounded border border-secondary/40 bg-secondary/10 px-space-sm py-1.5 font-mono text-label-sm text-secondary transition-colors hover:bg-secondary/20"
              >
                <Icon name="candlestick_chart" size={15} />
                Trade Claims
              </Link>
              {project.status === 'IN_PRODUCTION' && (
                <Link
                  href={`/studio/${project.slug}/milestones/2/submit`}
                  className="inline-flex items-center gap-1.5 rounded border border-outline-variant/40 bg-surface-container px-space-sm py-1.5 font-mono text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
                >
                  <Icon name="upload" size={15} />
                  Submit Evidence
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-space-lg px-space-lg py-space-lg lg:grid-cols-3 lg:px-margin">
        <div className="flex flex-col gap-space-lg lg:col-span-2">
          {/* ── Video / Media Showcase ──────────────────────────────── */}
          <ProjectMediaShowcase title={project.title} tagline={project.tagline} media={media} />

          {/* ── Tab nav (anchor-based, no JS) ───────────────────────── */}
          <div className="flex gap-1 overflow-x-auto border-b border-outline-variant/30 pb-0 font-mono text-label-sm">
            {[
              { label: 'About', href: '#about' },
              { label: 'Milestones & Escrow', href: '#milestones' },
              { label: 'Tokenomics', href: '#tokenomics' },
              { label: 'Technical Specs', href: '#specs' },
              { label: 'Founder Updates', href: '#updates' },
            ].map((tab) => (
              <a
                key={tab.href}
                href={tab.href}
                className="shrink-0 rounded-t border-b-2 border-transparent px-space-sm py-2 uppercase tracking-wider text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
              >
                {tab.label}
              </a>
            ))}
          </div>

          {/* ── About ─────────────────────────────────────────────── */}
          <section id="about" className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
            <h2 className="mb-space-xs font-mono text-label-md uppercase tracking-wider text-on-surface">
              About this build
            </h2>
            {project.description.split('\n\n').map((paragraph, index) => (
              <p key={index} className="mb-space-sm text-body-md leading-relaxed text-on-surface-variant">
                {paragraph}
              </p>
            ))}
          </section>

          {/* ── Milestones & Escrow ───────────────────────────────── */}
          <MilestoneTimeline project={project} />

          {/* ── Tokenomics ────────────────────────────────────────── */}
          <section id="tokenomics" className="flex flex-col gap-space-md">
            <h2 className="font-display text-headline-md uppercase tracking-tight text-on-surface">
              Tokenomics & Revenue Share
            </h2>
            <div className="grid grid-cols-1 gap-space-md sm:grid-cols-3">
              {[
                { label: 'Claim price', value: `${formatEthNumber(project.claimPrice, 4)} ETH`, icon: 'sell' },
                { label: 'Total supply', value: formatNumber(project.totalClaims), icon: 'token' },
                { label: 'Committed', value: `${formatNumber(project.claimsCommitted)} / ${formatNumber(project.totalClaims)}`, icon: 'how_to_vote' },
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex flex-col gap-1 rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
                  <Icon name={icon} size={20} className="text-secondary" />
                  <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">{label}</span>
                  <span className="font-display text-headline-sm tabular text-on-surface">{value}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md font-mono text-label-sm">
              <div className="mb-space-sm uppercase tracking-wider text-on-surface-variant">Revenue waterfall</div>
              <div className="space-y-2 text-on-surface-variant">
                <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
                  <span>Protocol fee (on secondary sales)</span>
                  <span className="tabular text-secondary">1.0%</span>
                </div>
                <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
                  <span>Founder (escrow release on approval)</span>
                  <span className="tabular text-primary">per milestone</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Claim holders (physical delivery)</span>
                  <span className="tabular text-on-surface">1 unit per claim</span>
                </div>
              </div>
              <p className="mt-space-sm text-outline">
                Capital held in MilestoneEscrow.sol on Arbitrum Sepolia. Released tranche-by-tranche against approved production evidence.
              </p>
            </div>
          </section>

          {/* ── Technical Specs ──────────────────────────────────── */}
          <section id="specs" className="flex flex-col gap-space-md">
            <h2 className="font-display text-headline-md uppercase tracking-tight text-on-surface">
              Technical Specs & BOM
            </h2>
            {media.specs.length > 0 ? (
              <div className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
                <dl className="grid grid-cols-1 gap-space-sm font-mono text-label-sm sm:grid-cols-2">
                  {media.specs.map((spec) => (
                    <div key={spec.label} className="flex items-center gap-space-sm border-b border-outline-variant/20 pb-2">
                      <Icon name={spec.icon} size={16} className="shrink-0 text-secondary" />
                      <dt className="text-on-surface-variant">{spec.label}</dt>
                      <dd className="ml-auto tabular text-on-surface">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-space-sm font-mono text-label-sm text-outline">
                  Full Bill of Materials available via IPFS after milestone 1 approval.
                </p>
              </div>
            ) : (
              <p className="rounded-lg border-dashed border-outline-variant/40 bg-surface-container p-space-md text-center font-mono text-label-sm text-outline">
                Technical specifications will be published at milestone 1.
              </p>
            )}

            {/* Live telemetry HUD */}
            {media.telemetry.length > 0 && (
              <div className="rounded-lg border-outline-variant/40 bg-surface-container-lowest p-space-md">
                <div className="mb-space-sm flex items-center gap-2 font-mono text-label-sm uppercase tracking-wider text-primary">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  Live Prototype Telemetry
                </div>
                <div className="grid grid-cols-2 gap-space-sm sm:grid-cols-4">
                  {media.telemetry.map((row) => (
                    <div key={row.label} className="rounded border border-outline-variant/30 p-2 font-mono text-label-sm">
                      <div className="text-on-surface-variant">{row.label}</div>
                      <div className="tabular text-primary">{row.value} <span className="text-outline">{row.unit}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── Founder Updates ──────────────────────────────────── */}
          <UpdatesFeed projectId={project.id} />
        </div>

        <SummaryRail project={project} />
      </div>
    </>
  );
}
