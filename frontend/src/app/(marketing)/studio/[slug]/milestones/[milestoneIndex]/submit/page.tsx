import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import { MilestoneEvidenceSubmit } from '@/components/studio/evidence-submit';
import { Icon } from '@/components/ui/icon';
import { getProjectBySlug, getProjects } from '@/lib/data/catalogue';

export const revalidate = 20;

interface PageProps {
  params: Promise<{ slug: string; milestoneIndex: string }>;
}

export async function generateStaticParams() {
  const projects = await getProjects();
  return projects.flatMap((project) =>
    project.milestones.map((_, i) => ({
      slug: project.slug,
      milestoneIndex: String(i),
    })),
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, milestoneIndex } = await params;
  const project = await getProjectBySlug(slug);
  const milestone = project?.milestones[Number(milestoneIndex)];
  return {
    title: milestone
      ? `Submit evidence: ${milestone.title} — ${project?.title}`
      : 'Submit milestone evidence',
    description: milestone
      ? `Attach factory evidence for "${milestone.title}" and open the backer vote window on ${project?.title}.`
      : undefined,
  };
}

/**
 * Founder Milestone Evidence Submission Studio (Screen 27).
 *
 * Resolves the project and milestone through the unified catalogue so a founder
 * can submit against a live on-chain record, then hands off to the interactive
 * client form which pins the artefacts and calls `submitEvidence()`.
 */
export default async function MilestoneSubmitPage({ params }: PageProps) {
  const { slug, milestoneIndex } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const idx = Number(milestoneIndex);
  const milestone = project.milestones[idx];
  if (!milestone) notFound();

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <nav
            aria-label="Breadcrumb"
            className="mb-space-sm flex flex-wrap items-center gap-1.5 font-mono text-label-sm text-outline"
          >
            <Link href="/studio" className="transition-colors hover:text-primary">
              Studio
            </Link>
            <Icon name="chevron_right" size={14} />
            <span className="text-on-surface">{project.title}</span>
            <Icon name="chevron_right" size={14} />
            <span className="text-on-surface">Milestone {idx + 1} Evidence</span>
          </nav>
          <h1 className="font-display text-headline-md text-on-surface">
            Submit Milestone Evidence
          </h1>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Upload cryptographic evidence of production progress to open the backer vote window.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-space-lg py-space-xl lg:px-margin">
        <MilestoneEvidenceSubmit project={project} milestone={milestone} milestoneIndex={idx} />
      </div>
    </>
  );
}
