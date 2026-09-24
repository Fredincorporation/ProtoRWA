import Image from 'next/image';
import Link from 'next/link';

import { Icon } from '@/components/ui/icon';
import { projectStatus } from '@/lib/status';
import { formatUsdgNumber, formatNumber } from '@/lib/format';
import { getProjectMedia } from '@/lib/project-media';
import type { Project } from '@protorwa/shared';

/**
 * "Featured Production Batches" grid.
 *
 * Layout ported faithfully: a header row with a mono kicker and a "view all"
 * link, then three cards. Each card is a 44-height media block with a batch
 * badge top-left and a network badge top-right, a title with a right-aligned
 * metric, a one-line description, a two-column mono spec grid, and a coverage bar.
 *
 * COPY REVIEW REQUIRED - the source design hardcoded three fictional projects
 * and attached unverifiable claims to them:
 *   - "2.4x APY Target" / "1.9x APY"    -> return projections.
 *   - "Purchase order backed by 4 municipal contracts" -> invented order book.
 *   - "View All 42 Live Production Batches"            -> invented inventory.
 * This component instead renders whatever projects it is given. With no data it
 * shows an explicit empty state rather than filler, so nothing false ships.
 */

interface BatchCardProps {
  project: {
    id: string;
    slug: string;
    title: string;
    tagline: string;
    batchLabel: string | null;
    status: string;
    /** Real cover image URL (from projectMedia catalogue). */
    coverUrl: string;
    /** Coverage in basis points (0-10000). */
    fundedBps: number;
    targetWei: string;
    committedWei: string;
    feeLabel: string;
    claimPriceWei: string;
    totalClaims: string;
    claimsCommitted: string;
  };
}

/** A single project tile. */
function BatchCard({ project }: BatchCardProps) {
  const status = projectStatus(project.status);
  const href = `/projects/${project.slug}`;

  return (
    <Link
      href={href}
      className="group flex-col justify-between space-y-space-md rounded-lg bg-surface-container p-space-md transition-colors hover:bg-surface-container-high"
    >
      <div className="space-y-space-sm">
        <div className="relative h-44 w-full overflow-hidden rounded bg-surface-container-lowest">
          {/* Real cover image from the project media catalogue. */}
          {project.coverUrl ? (
            <Image
              src={project.coverUrl}
              alt={project.title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center gap-1 text-outline">
                <Icon name="deployed_code" size={32} />
                <span className="font-mono text-label-sm uppercase">No media</span>
              </div>
            </div>
          )}
          {project.batchLabel ? (
            <span className="absolute left-2 top-2 rounded bg-surface/90 px-2 py-0.5 font-mono text-label-sm text-primary">
              {project.batchLabel}
            </span>
          ) : null}
          <span className="absolute right-2 top-2 rounded bg-surface/90 px-2 py-0.5 font-mono text-label-sm text-secondary">
            {status.label}
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-headline-sm text-on-surface transition-colors group-hover:text-primary">
              {project.title}
            </h3>
            <span className="shrink-0 font-mono text-label-md font-bold text-primary">
              {project.feeLabel}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-body-sm text-on-surface-variant">
            {project.tagline}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded bg-surface-container-lowest p-2 font-mono text-label-sm">
          <div>
            <span className="text-outline">Escrow Target:</span>
            <div className="font-semibold tabular text-on-surface">
              {formatUsdgNumber(project.targetWei, 2)} USDG
            </div>
          </div>
          <div>
            <span className="text-outline">Claim Price:</span>
            <div className="font-semibold tabular text-on-surface">
              {formatUsdgNumber(project.claimPriceWei, 4)} USDG
            </div>
          </div>
          <div>
            <span className="text-outline">Claims:</span>
            <div className="font-semibold tabular text-on-surface">
              {formatNumber(project.claimsCommitted)} / {formatNumber(project.totalClaims)}
            </div>
          </div>
          <div>
            <span className="text-outline">Committed:</span>
            <div className="font-semibold tabular text-on-surface">
              {formatUsdgNumber(project.committedWei, 2)} USDG
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between font-mono text-label-sm text-on-surface-variant">
          <span>Funded</span>
          <span className="tabular">{(project.fundedBps / 100).toFixed(1)}%</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded bg-surface-container-lowest"
          role="progressbar"
          aria-valuenow={Math.round(project.fundedBps / 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${project.title} funding progress`}
        >
          <div
            className="h-full rounded bg-gradient-to-r from-primary to-secondary"
            style={{ width: `${Math.max(0, Math.min(100, project.fundedBps / 100))}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

/** Maps a domain Project into the card view model. */
export function toBatchCard(project: Project): BatchCardProps['project'] {
  const target = BigInt(project.escrow.target || '0');
  const committed = BigInt(project.escrow.totalCommitted || '0');
  const fundedBps = target === 0n ? 0 : Number((committed * 10_000n) / target);
  const { cover } = getProjectMedia(project.slug, {
    coverCid: project.coverCid,
    galleryCids: project.galleryCids,
  });

  return {
    id: project.id,
    slug: project.slug,
    title: project.title,
    tagline: project.tagline,
    batchLabel: null,
    status: project.status,
    coverUrl: cover,
    fundedBps,
    targetWei: project.escrow.target,
    committedWei: project.escrow.totalCommitted,
    // Describes the funding structure, not a yield. Kept neutral on purpose.
    feeLabel: 'Milestone escrow',
    claimPriceWei: project.claimPrice,
    totalClaims: project.totalClaims,
    claimsCommitted: project.claimsCommitted,
  };
}

export function FeaturedBatches({ projects }: { projects: Project[] }) {
  return (
    <section className="w-full bg-surface px-space-lg py-space-xl lg:px-margin">
      <div className="mx-auto max-w-7xl space-y-space-lg">
        <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-end">
          <div>
            <span className="font-mono text-label-md uppercase tracking-widest text-primary">
              {'//'} Curated Underwriting
            </span>
            <h2 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
              Featured Production Batches
            </h2>
            <p className="mt-1 text-body-md text-on-surface-variant">
              Hardware builds currently accepting capital commitments.
            </p>
          </div>
          <Link
            href="/explore"
            data-path="explore-projects"
            className="inline-flex items-center gap-1 font-mono text-label-md text-primary hover:underline"
          >
            {/* No hardcoded count - it must come from the index. */}
            <span>Browse all projects</span>
            <Icon name="arrow_forward" size={16} />
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-lg border-dashed border-outline-variant/50 bg-surface-container p-space-xl text-center">
            <Icon name="inventory_2" size={32} className="mx-auto text-outline" />
            <p className="mt-2 font-display text-headline-sm text-on-surface">
              No projects published yet
            </p>
            <p className="mx-auto mt-1 max-w-md text-body-sm text-on-surface-variant">
              Projects appear here once a founder registers a hardware build and
              opens it for commitments.
            </p>
            <Link
              href="/studio"
              className="mt-4 inline-flex items-center gap-2 rounded bg-primary px-space-md py-2 font-mono text-label-md text-on-primary"
            >
              <Icon name="add" size={18} />
              Create a project
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-space-md md:grid-cols-3">
            {projects.map((project) => (
              <BatchCard key={project.id} project={toBatchCard(project)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
