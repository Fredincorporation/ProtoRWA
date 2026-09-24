import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Icon } from '@/components/ui/icon';
import { FounderProfileView } from '@/components/founders/founder-profile-view';
import { getProjects } from '@/lib/data/catalogue';
import {
  addressForHandle,
  deriveFounderDirectory,
  founderHandle,
} from '@/lib/data/founders';

/**
 * Founder profile (/founders/[handle]).
 *
 * The [handle] segment is either a known demo handle (heliofrost) or a raw
 * 0x address, so any founder the catalogue knows is reachable. The heavy work —
 * follow state and IPFS-resolved posts — is the client view; this server shell
 * only resolves the address against the catalogue and reads the founder's
 * projects, matching how the project pages source live data.
 */
export const revalidate = 20;

interface PageProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const projects = await getProjects();
  const address = addressForHandle(handle, projects);
  const summary = deriveFounderDirectory(projects).find((s) => s.address === address);
  if (!summary) return { title: 'Founder not found' };
  return { title: `${summary.displayName} · Founder`, description: summary.bio ?? undefined };
}

export default async function FounderPage({ params }: PageProps) {
  const { handle } = await params;
  const projects = await getProjects();
  const address = addressForHandle(handle, projects);
  if (!address) notFound();

  const directory = deriveFounderDirectory(projects);
  const summary = directory.find((s) => s.address.toLowerCase() === address.toLowerCase());
  if (!summary) notFound();

  const owned = projects.filter((p) => p.founder.toLowerCase() === address.toLowerCase());

  return (
    <>
      <div className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-2 lg:px-margin">
        <div className="mx-auto flex max-w-6xl items-center gap-1.5 font-mono text-label-sm text-outline">
          <Link href="/founders" className="transition-colors hover:text-primary">
            Founders
          </Link>
          <Icon name="chevron_right" size={14} />
          <span className="text-on-surface-variant">@{founderHandle(address)}</span>
        </div>
      </div>
      <FounderProfileView founder={address} summary={summary} projects={owned} />
    </>
  );
}
