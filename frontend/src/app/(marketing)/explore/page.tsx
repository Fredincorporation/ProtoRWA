import { ExploreView } from './explore-view';
import { getProjects } from '@/lib/data/catalogue';

/**
 * Explore Projects (/explore).
 *
 * Server component so the live on-chain catalogue is read once, server-side, and
 * handed to the client filtering view. A published project appears here without a
 * rebuild thanks to the short revalidate window.
 */
export const revalidate = 20;

export default async function ExplorePage() {
  const projects = await getProjects();
  return <ExploreView projects={projects} />;
}
