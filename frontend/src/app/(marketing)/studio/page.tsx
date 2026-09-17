import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/ui/icon';
import { mockProjects } from '@/lib/data/mock';
import { formatEthNumber, formatNumber, percentOf } from '@/lib/format';
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
export default function StudioPage() {
  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-space-md">
          <div>
            <div className="mb-1 font-mono text-label-md uppercase tracking-widest text-primary">
              {'//'} Founder Studio
            </div>
            <h1 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
              Project Control Room
            </h1>
            <p className="mt-2 max-w-2xl text-body-md text-on-surface-variant">
              Submit milestone evidence, monitor escrow release, and publish
              production updates to claim holders.
            </p>
          </div>
          <Link
            href="/studio/new"
            className="inline-flex items-center gap-2 rounded bg-primary px-space-md py-3 font-display text-headline-sm text-on-primary transition-colors hover:bg-primary-fixed"
          >
            <Icon name="add" size={20} />
            New project
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-space-lg py-space-lg lg:px-margin">
        <div className="mb-space-md flex-wrap items-center gap-space-sm rounded border-tertiary/40 bg-tertiary/5 p-space-sm">
          <Icon name="info" size={18} className="shrink-0 text-tertiary" />
          <p className="font-mono text-label-sm text-tertiary">
            Demo mode: no wallet is connected and no registry is deployed, so the
            actions below are previews. Connect a founder wallet to enable them.
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
                        {formatEthNumber(committed, 1)} / {formatEthNumber(target, 1)} ETH
                      </div>
                    </div>
                    <div>
                      <div className="text-outline">Funded</div>
                      <div className="tabular text-primary">{funded.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-outline">Released</div>
                      <div className="tabular text-secondary">
                        {formatEthNumber(project.escrow.totalReleased, 1)} ETH
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
                        ({formatEthNumber(nextMilestone.trancheAmount, 1)} ETH tranche,{' '}
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
                      Submit evidence (Screen 27)
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
