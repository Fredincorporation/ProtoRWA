/**
 * Unified project catalogue: curated demo data + live on-chain projects.
 *
 * The screens used to import `mockProjects` directly, so a project published on
 * the deployed registry never appeared. Every page that lists or opens a project
 * should read through here instead.
 *
 * Merge rule (deliberate, and it is what makes the published projects show up
 * without burying the showcase):
 *   - The curated demo projects always render. They exercise UI states a raw
 *     chain read cannot (live votes, submitted evidence, delivered progress).
 *   - A live project is appended unless a curated project already represents it,
 *     i.e. a demo row pinned to the same on-chain id via `onChainProjectId`.
 *
 * A showcase row may deliberately run on simulated market data (`liquidityMode:
 * 'demo'`) while still standing in for its real on-chain twin, so dedup keys off
 * `onChainProjectId` alone rather than also requiring 'real' liquidity. Every
 * chain read in the app gates on `liquidityMode === 'real'`, so carrying the id
 * on a demo row never makes it hit the chain.
 *
 * So the flagship demo stays polished while any genuinely new on-chain project
 * (published through the founder wizard) surfaces alongside it. If the live read
 * fails it returns [] and the catalogue is just the demo data - see chain.ts.
 */

import { mockProjects } from '@/lib/data/mock';
import { fetchLiveProjects } from '@/lib/data/chain';
import type { Project } from '@protorwa/shared';

/** Ids the curated demo already stands in for, so they are not shown twice. */
function representedIds(): Set<string> {
  return new Set(
    mockProjects
      .map((project) => project.onChainProjectId)
      .filter((id): id is string => Boolean(id)),
  );
}

/** All projects the app can render: demo showcase plus any new live commitments. */
export async function getProjects(): Promise<Project[]> {
  const live = await fetchLiveProjects();
  const seen = representedIds();
  const newLive = live.filter((project) => !seen.has(project.onChainProjectId ?? project.id));
  return [...mockProjects, ...newLive];
}

export async function getProjectBySlug(slug: string): Promise<Project | undefined> {
  const projects = await getProjects();
  return projects.find((project) => project.slug === slug);
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const projects = await getProjects();
  return projects.find((project) => project.id === id || project.onChainProjectId === id);
}
