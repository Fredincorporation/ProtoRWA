import { cn } from '@/lib/utils';
import { categoryMap } from '@/lib/status';
import { projectStatus } from '@/lib/status';
import { formatEthNumber, formatNumber, percentOf } from '@/lib/format';
import { Icon } from '@/components/ui/icon';
import type { IndustryCategory, Project, ProjectStatus } from '@protorwa/shared';

/**
 * Project card for Explore and Featured grids.
 *
 * Fields follow the PRD in screen 07 ("Each card shows: thumbnail/video preview,
 * title, short description, funding progress bar, days left or status, claim
 * token ticker"), plus the batch/status badges from the landing design.
 */

export interface ProjectCardProps {
  project: Project;
  className?: string;
}

const FUNDING_STATUSES: ProjectStatus[] = ['FUNDING', 'IN_PRODUCTION', 'COMPLETED'];

/** Days remaining until the funding deadline; null when not applicable. */
function daysLeft(deadlineIso: string): number | null {
  const deadline = new Date(deadlineIso).getTime();
  if (Number.isNaN(deadline)) return null;
  const delta = deadline - Date.now();
  if (delta <= 0) return null;
  return Math.ceil(delta / 86_400_000);
}

export function ProjectCard({ project, className }: ProjectCardProps) {
  const status = projectStatus(project.status);
  const category = categoryMap[project.category as IndustryCategory];
  const funded = percentOf(
    BigInt(project.escrow.totalCommitted || '0'),
    BigInt(project.escrow.target || '0'),
  );
  const released = percentOf(
    BigInt(project.escrow.totalReleased || '0'),
    BigInt(project.escrow.target || '0'),
  );

  const days = daysLeft(project.escrow.fundingDeadline);
  const approvedCount = project.milestones.filter((m) => m.status === 'APPROVED').length;

  /** Ticker is derived, not stored: short uppercase token symbol per project. */
  const ticker = project.title
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 5)
    .toUpperCase();

  return (
    <a
      href={`/projects/${project.slug}`}
      className={cn(
        // `flex h-full flex-col` keeps every card in a row the same height and
        // lets the footer sit at the bottom regardless of how many spec rows a
        // given project renders.
        'group flex h-full flex-col overflow-hidden rounded-lg border-outline-variant/40 bg-surface-container',
        'transition-colors hover:border-outline-variant hover:bg-surface-container-high',
        className,
      )}
    >
      {/* Media / preview */}
      <div className="relative h-44 w-full overflow-hidden bg-surface-container-lowest">
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-1 text-outline">
            <Icon name="deployed_code" size={32} />
            <span className="font-mono text-label-sm uppercase">
              {project.coverCid ? 'Media on IPFS' : 'No media'}
            </span>
          </div>
        </div>

        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-surface/90 px-2 py-0.5 font-mono text-label-sm text-primary">
          <Icon name={category.icon} size={13} />
          {category.label}
        </span>

        <span
          className={cn(
            'absolute right-2 top-2 rounded bg-surface/90 px-2 py-0.5 font-mono text-label-sm uppercase',
            status.tone === 'brand' && 'text-primary',
            status.tone === 'accent' && 'text-secondary',
            status.tone === 'success' && 'text-primary',
            status.tone === 'warn' && 'text-tertiary',
            status.tone === 'danger' && 'text-error',
            status.tone === 'neutral' && 'text-on-surface-variant',
          )}
        >
          {status.label}
        </span>

        {project.pitchVideoCid ? (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-surface/90 px-2 py-0.5 font-mono text-label-sm text-on-surface-variant">
            <Icon name="play_circle" size={13} />
            Pitch video
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-space-sm p-space-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-headline-sm text-on-surface transition-colors group-hover:text-primary">
              {project.title}
            </h3>
            <p className="mt-0.5 line-clamp-2 text-body-sm text-on-surface-variant">
              {project.tagline}
            </p>
          </div>
          <span className="shrink-0 rounded border-outline-variant/50 bg-surface-container-lowest px-2 py-0.5 font-mono text-label-sm text-secondary">
            {ticker}
          </span>
        </div>

        {/* Funding progress */}
        <div className="space-y-1">
          <div className="flex items-baseline justify-between font-mono text-label-sm">
            <span className="tabular text-on-surface">
              {formatEthNumber(project.escrow.totalCommitted, 2)} /{' '}
              {formatEthNumber(project.escrow.target, 2)} ETH
            </span>
            <span className="tabular text-primary">{funded.toFixed(1)}%</span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded bg-surface-container-lowest"
            role="progressbar"
            aria-valuenow={Math.round(funded)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${project.title} funding progress`}
          >
            <div
              className="h-full rounded bg-gradient-to-r from-primary to-secondary"
              style={{ width: `${Math.min(100, funded)}%` }}
            />
          </div>
          {/*
           * Released portion is what has actually left escrow. Shown as a second
           * bar rather than a loose line, so the two figures read as one
           * comparison instead of an orphaned caption under the first bar.
           */}
          <div className="space-y-1 pt-1">
            <div className="flex items-baseline justify-between font-mono text-label-sm">
              <span className="text-outline">Released to founder</span>
              <span className="tabular text-secondary">{released.toFixed(1)}%</span>
            </div>
            <div
              className="h-1 w-full overflow-hidden rounded bg-surface-container-lowest"
              role="progressbar"
              aria-valuenow={Math.round(released)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${project.title} escrow released`}
            >
              <div
                className="h-full rounded bg-secondary"
                style={{ width: `${Math.min(100, released)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Spec grid */}
        <div className="grid grid-cols-2 gap-2 rounded bg-surface-container-lowest p-2 font-mono text-label-sm">
          <div>
            <span className="text-outline">Claim price</span>
            <div className="tabular font-semibold text-on-surface">
              {formatEthNumber(project.claimPrice, 4)} ETH
            </div>
          </div>
          <div>
            <span className="text-outline">Claims</span>
            <div className="tabular font-semibold text-on-surface">
              {formatNumber(project.claimsCommitted)}/{formatNumber(project.totalClaims)}
            </div>
          </div>
          <div>
            <span className="text-outline">Milestones</span>
            <div className="tabular font-semibold text-on-surface">
              {approvedCount}/{project.milestones.length}
            </div>
          </div>
          <div>
            <span className="text-outline">Holders</span>
            <div className="tabular font-semibold text-on-surface">
              {project.metrics?.holders != null ? formatNumber(project.metrics.holders) : '—'}
            </div>
          </div>
        </div>

        {/* Footer: days left or status */}
        <div className="mt-auto flex items-center justify-between border-t border-outline-variant/30 pt-space-sm font-mono text-label-sm">
          <span className="text-on-surface-variant">
            {project.status === 'FUNDING' && days != null
              ? `${days} days left`
              : project.status === 'FUNDING'
                ? 'Deadline passed'
                : status.label}
          </span>
          <span className="inline-flex items-center gap-1 text-primary opacity-0 transition-opacity group-hover:opacity-100">
            View project
            <Icon name="arrow_forward" size={14} />
          </span>
        </div>
      </div>
    </a>
  );
}

export { FUNDING_STATUSES };
