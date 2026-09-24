import type { Metadata } from 'next';

import { FoundersDirectoryView } from '@/components/founders/founders-directory-view';
import { getProjects } from '@/lib/data/catalogue';
import { deriveFounderDirectory } from '@/lib/data/founders';

/**
 * Founder directory (/founders).
 *
 * Server component: reads the catalogue once, collapses it to the set of founder
 * addresses that own a project, and hands the list to the client view (which owns
 * the wallet-scoped follow controls). Same 20s window as the rest of the live
 * surface, so a newly published founder appears without a rebuild.
 */
export const revalidate = 20;

export const metadata: Metadata = {
  title: 'Founders',
  description: 'Follow the hardware founders building on ProtoRWA.',
};

export default async function FoundersPage() {
  const projects = await getProjects();
  const founders = deriveFounderDirectory(projects);
  return <FoundersDirectoryView founders={founders} />;
}
