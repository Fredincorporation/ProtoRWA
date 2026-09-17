import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import { InvestClientWrapper } from './invest-client';
import { Icon } from '@/components/ui/icon';
import { getProjectBySlug, mockProjects } from '@/lib/data/mock';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return mockProjects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  return {
    title: project ? `Commit capital - ${project.title}` : 'Commit capital',
    description: project
      ? `Commit capital to ${project.title} and receive milestone-gated claims.`
      : undefined,
  };
}

/**
 * Invest flow.
 *
 * `connected` and `deployed` are false in this demo, and are passed in rather
 * than hardcoded inside the component so wiring real wallet state later is a
 * one-line change. The flow uses them to explain *why* committing is
 * unavailable, instead of presenting a button that silently does nothing.
 */
export default async function InvestPage({ params }: PageProps) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project) notFound();

  const deployed = Boolean(process.env.NEXT_PUBLIC_PROJECT_REGISTRY);

  return (
    <>
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
            <Link
              href={`/projects/${project.slug}`}
              className="transition-colors hover:text-primary"
            >
              {project.title}
            </Link>
            <Icon name="chevron_right" size={14} />
            <span className="text-on-surface-variant">Commit capital</span>
          </nav>

          <h1 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
            Commit Capital
          </h1>
          <p className="mt-2 max-w-3xl text-body-md text-on-surface-variant">
            Choose how many claim units to purchase. Capital moves into escrow and
            is released to the founder one milestone at a time, against evidence
            you and other holders approve.
          </p>
        </div>
      </header>

      {/* Wallet state is surfaced here rather than left to the button alone. */}
      {!deployed ? (
        <div className="mx-auto max-w-7xl px-space-lg pt-space-lg lg:px-margin">
          <div className="flex flex-wrap items-center gap-space-sm rounded border-tertiary/40 bg-tertiary/5 p-space-sm">
            <Icon name="info" size={18} className="shrink-0 text-tertiary" />
            <p className="font-mono text-label-sm text-tertiary">
              Preview mode: no contracts are deployed on this network, so this flow
              validates your input and builds the call but does not submit it.
            </p>
          </div>
        </div>
      ) : null}

      <InvestClientWrapper project={project} deployed={deployed} />
    </>
  );
}
