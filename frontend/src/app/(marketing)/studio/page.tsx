import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/ui/icon';
import { mockProjects } from '@/lib/data/mock';
import { defaultChain, type Project } from '@protorwa/shared';
import { formatUsdgNumber, formatNumber, percentOf } from '@/lib/format';
import { projectStatus } from '@/lib/status';

export const metadata: Metadata = {
  title: 'Founder Studio',
  description:
    'Manage hardware projects, submit milestone evidence, and post production updates.',
};

/**
 * Founder Studio dashboard (/studio).
 *
 * Per the PRD in screen 07: "Founder dashboard: list of your projects, status,
 * funding progress, milestone submission buttons, update posting."
 *
 * In the demo the viewer is not an authenticated founder, so the projects shown
 * are the demo set presented read-only. The evidence and update actions are
 * rendered disabled with the reason stated, rather than as buttons that do
 * nothing.
 */
/** 5-KPI Metric Horizon — every figure derived from the demo project set. */
function StudioKpiHorizon({ projects }: { projects: Project[] }) {
  const wei = (v: string) => BigInt(v || '0');
  const sum = (pick: (p: Project) => bigint) =>
    projects.reduce((acc, p) => acc + pick(p), 0n);

  const totalCommitted = sum((p) => wei(p.escrow.totalCommitted));
  const totalReleased = sum((p) => wei(p.escrow.totalReleased));
  const totalLocked = sum((p) => wei(p.escrow.locked));
  const disbursedPct = percentOf(totalReleased, totalCommitted);

  const evidenceMilestones = projects.flatMap((p) =>
    p.milestones
      .filter((m) => m.status === 'EVIDENCE')
      .map((m) => ({ project: p.title, title: m.title })),
  );
  const disputedCount = projects.reduce(
    (acc, p) => acc + p.milestones.filter((m) => m.status === 'DISPUTED').length,
    0,
  );

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-space-sm mb-space-lg">
      <div className="bg-surface-container p-space-md rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Total Capital Funded</span>
          <Icon name="account_balance" size={18} className="text-primary" />
        </div>
        <div className="mt-space-md">
          <span className="font-display text-headline-md text-on-surface font-semibold tracking-tight">{formatUsdgNumber(totalCommitted)} USDG</span>
        </div>
        <div className="mt-space-xs flex items-center gap-1.5 font-mono text-label-sm text-primary">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span>{projects.length} tracked hardware lines</span>
        </div>
      </div>

      <div className="bg-surface-container p-space-md rounded-xl shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Escrow Released</span>
          <Icon name="lock_open" size={18} className="text-secondary" />
        </div>
        <div className="mt-space-md">
          <span className="font-display text-headline-md text-on-surface font-semibold tracking-tight">{formatUsdgNumber(totalReleased)} USDG</span>
        </div>
        <div className="mt-space-xs flex items-center gap-1.5 font-mono text-label-sm text-secondary">
          <span className="font-semibold">{disbursedPct.toFixed(1)}%</span>
          <span className="text-on-surface-variant">disbursed post-audit</span>
        </div>
      </div>

      <div className="bg-surface-container p-space-md rounded-xl shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Stage Lock Capital</span>
          <Icon name="lock_clock" size={18} className="text-tertiary" />
        </div>
        <div className="mt-space-md">
          <span className="font-display text-headline-md text-on-surface font-semibold tracking-tight">{formatUsdgNumber(totalLocked)} USDG</span>
        </div>
        <div className="mt-space-xs font-mono text-label-sm text-on-surface-variant truncate">
          Awaiting milestone ratification
        </div>
      </div>

      <div className="bg-surface-container p-space-md rounded-xl shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Active Milestone Votes</span>
          <Icon name="how_to_vote" size={18} className="text-tertiary" />
        </div>
        <div className="mt-space-md flex items-baseline gap-2">
          <span className="font-display text-headline-md text-on-surface font-semibold">{evidenceMilestones.length} Open</span>
        </div>
        <div className="mt-space-xs font-mono text-label-sm text-on-surface-variant truncate">
          {evidenceMilestones[0]
            ? `${evidenceMilestones[0].project} · ${evidenceMilestones[0].title}`
            : 'No evidence windows in flight'}
        </div>
      </div>

      <div className="bg-surface-container p-space-md rounded-xl shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Open Disputes</span>
          <Icon name="gavel" size={18} className={disputedCount > 0 ? 'text-error' : 'text-primary'} />
        </div>
        <div className="mt-space-md flex items-baseline gap-2">
          <span className="font-display text-headline-md text-on-surface font-semibold">{disputedCount} Flagged</span>
        </div>
        <div className="mt-space-xs font-mono text-label-sm text-on-surface-variant">
          {disputedCount > 0 ? 'Escalated to protocol oracle' : 'Nothing under oracle review'}
        </div>
      </div>
    </section>
  );
}

export default function StudioPage() {
  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl flex flex-col xl:flex-row items-start xl:items-end justify-between gap-space-md">
          <div className="flex flex-col gap-space-xs max-w-3xl">
            <div className="flex items-center gap-space-xs">
              <span className="px-2 py-0.5 rounded bg-surface-container font-mono text-label-sm text-primary uppercase font-semibold">
                ISSUER KEY #0x892A
              </span>
              <span className="text-outline-variant font-mono text-label-sm">/</span>
              <span className="font-mono text-label-sm text-on-surface-variant uppercase tracking-wider">
                Shenzhen • Berlin • Austin Facilities
              </span>
            </div>
            <h1 className="font-display text-headline-lg text-on-surface tracking-tight">
              Founder Production Studio <span className="text-outline font-normal">//</span> <span className="text-primary">Active Issuer Desk</span>
            </h1>
            <p className="text-body-md text-on-surface-variant">
              Real-time monitoring of tokenized hardware tranches, escrow capital releases, pending backer approvals, and factory oracle telemetry streams.
            </p>
          </div>

          {/* Action cluster from Screen 11 */}
          <div className="flex flex-wrap items-center gap-space-xs">
            <Link
              href="/studio/new"
              className="px-space-md py-2.5 bg-primary text-on-primary font-mono text-label-sm uppercase font-semibold rounded-lg hover:bg-primary-fixed transition-colors flex items-center gap-1.5 shadow-md"
            >
              <Icon name="add_circle" size={18} />
              Create New Project
            </Link>
            <Link
              href="/studio/heliofrost-pro/milestones/2/submit"
              className="px-space-md py-2.5 bg-surface-container-high hover:bg-surface-bright text-on-surface font-mono text-label-sm rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Icon name="verified_user" size={18} className="text-secondary" />
              Submit Evidence
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-space-lg py-space-lg lg:px-margin">
        {/* 5-KPI Metric Horizon — derived from the demo project set */}
        <StudioKpiHorizon projects={mockProjects} />

        <div className="mb-space-md flex-wrap items-center gap-space-sm rounded border-tertiary/40 bg-tertiary/5 p-space-sm">
          <Icon name="info" size={18} className="shrink-0 text-tertiary" />
          <p className="font-mono text-label-sm text-tertiary">
            Demo mode: connected as Founder Helio (ThermoVolt Labs). Contract writes verify against the live deployed MilestoneEscrow on {defaultChain.name}.
          </p>
        </div>

        <ul className="flex-col gap-space-md">
          {mockProjects.map((project) => {
            const status = projectStatus(project.status);
            const committed = BigInt(project.escrow.totalCommitted || '0');
            const target = BigInt(project.escrow.target || '0');
            const funded = percentOf(committed, target);
            const nextMilestone = project.milestones.find(
              (milestone) => milestone.status !== 'APPROVED',
            );
            const inProduction = project.status === 'IN_PRODUCTION';

            return (
              <li
                key={project.id}
                className="flex-col gap-space-md rounded-lg border-outline-variant/40 bg-surface-container p-space-md lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex-wrap items-center gap-space-sm">
                    <h2 className="font-display text-headline-sm text-on-surface">
                      {project.title}
                    </h2>
                    <span className="rounded border-outline-variant/50 bg-surface-container-lowest px-2 py-0.5 font-mono text-label-sm uppercase text-on-surface-variant">
                      {status.label}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-body-sm text-on-surface-variant">
                    {project.tagline}
                  </p>

                  <div className="mt-space-sm grid-cols-2 gap-space-sm font-mono text-label-sm md:grid-cols-4">
                    <div>
                      <div className="text-outline">Raised</div>
                      <div className="tabular text-on-surface">
                        {formatUsdgNumber(committed, 1)} / {formatUsdgNumber(target, 1)} USDG
                      </div>
                    </div>
                    <div>
                      <div className="text-outline">Funded</div>
                      <div className="tabular text-primary">{funded.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-outline">Released</div>
                      <div className="tabular text-secondary">
                        {formatUsdgNumber(project.escrow.totalReleased, 1)} USDG
                      </div>
                    </div>
                    <div>
                      <div className="text-outline">Claim holders</div>
                      <div className="tabular text-on-surface">
                        {project.metrics?.holders != null
                          ? formatNumber(project.metrics.holders)
                          : '—'}
                      </div>
                    </div>
                  </div>

                  {nextMilestone ? (
                    <div className="mt-space-sm flex-wrap items-center gap-space-xs font-mono text-label-sm">
                      <Icon name="flag" size={14} className="text-outline" />
                      <span className="text-on-surface-variant">
                        Next: {nextMilestone.title}
                      </span>
                      <span className="text-outline">
                        ({formatUsdgNumber(nextMilestone.trancheAmount, 1)} USDG tranche,{' '}
                        {nextMilestone.status === 'EVIDENCE' ? 'in review' : 'pending'})
                      </span>
                    </div>
                  ) : (
                    <div className="mt-space-sm flex items-center gap-space-xs font-mono text-label-sm text-primary">
                      <Icon name="check_circle" size={14} />
                      All milestones released
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-space-sm">
                  {nextMilestone && inProduction ? (
                    <Link
                      href={`/studio/${project.slug}/milestones/${nextMilestone.index}/submit`}
                      className="inline-flex items-center gap-2 rounded border border-primary/40 bg-primary/10 px-space-sm py-2 font-mono text-label-md text-primary transition-colors hover:bg-primary/20"
                    >
                      <Icon name="upload_file" size={16} />
                      Submit evidence
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title={
                        inProduction
                          ? 'All milestones are approved.'
                          : 'Evidence can only be submitted while the project is in production.'
                      }
                      className="inline-flex items-center gap-2 rounded border-outline-variant/50 px-space-sm py-2 font-mono text-label-md text-on-surface-variant opacity-50"
                    >
                      <Icon name="upload_file" size={16} />
                      Submit evidence
                    </button>
                  )}
                  <button
                    type="button"
                    disabled
                    title="Connect a founder wallet to post an update."
                    className="inline-flex items-center gap-2 rounded border-outline-variant/50 px-space-sm py-2 font-mono text-label-md text-on-surface-variant opacity-50"
                  >
                    <Icon name="campaign" size={16} />
                    Post update
                  </button>
                  <Link
                    href={`/projects/${project.slug}`}
                    className="inline-flex items-center gap-1 rounded px-space-sm py-2 font-mono text-label-md text-primary hover:underline"
                  >
                    View public page
                    <Icon name="arrow_forward" size={14} />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
