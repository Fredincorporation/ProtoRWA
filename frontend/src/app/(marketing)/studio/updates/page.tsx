import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/ui/icon';
import { FounderUpdatesView } from '@/components/founders/founder-updates-view';
import { getProjects } from '@/lib/data/catalogue';

/**
 * Founder updates console (/studio/updates).
 *
 * Server shell that hands the catalogue to the client console; the founder's own
 * projects are filtered there against the connected wallet. Kept under /studio to
 * sit alongside the project wizard and evidence submission.
 */
export const revalidate = 20;

export const metadata: Metadata = {
  title: 'Founder updates',
  description: 'Publish build updates to the backers who follow your projects.',
};

export default async function StudioUpdatesPage() {
  const projects = await getProjects();
  return (
    <>
      <div className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-2 lg:px-margin">
        <div className="mx-auto flex max-w-6xl items-center gap-1.5 font-mono text-label-sm text-outline">
          <Link href="/studio" className="transition-colors hover:text-primary">
            Studio
          </Link>
          <Icon name="chevron_right" size={14} />
          <span className="text-on-surface-variant">Updates</span>
        </div>
      </div>
      <FounderUpdatesView projects={projects} />
    </>
  );
}
