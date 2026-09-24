import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ClaimTradingTerminal } from '@/components/market/claim-trading-terminal';
import { getProjectById, getProjectBySlug } from '@/lib/data/catalogue';

/**
 * Per-asset trading terminal, routed by project slug.
 *
 * Slug is the collision-free key: the curated showcase projects are keyed by a
 * small display index (`id` '1'|'2'|'3') that overlaps the on-chain ids of live
 * projects, so an `id` route could resolve a demo row and a real commitment to
 * the same path. The catalogue assigns every project - curated and live - a
 * unique slug, so the terminal links and resolves by it. `getProjectById` is
 * kept as a fallback so a hand-typed numeric link still works.
 *
 * Resolution runs through the unified catalogue, so this renders both showcase
 * projects and any project published to the deployed registry. The heavy client
 * terminal takes the resolved project as a prop.
 *
 * Revalidated rather than fully dynamic: on-chain commitments change on a
 * block-time cadence, and a 20s window keeps the route cheap without going
 * stale. Reads inside the terminal itself stay live per wallet.
 */
export const revalidate = 20;

async function resolve(key: string) {
  return (await getProjectBySlug(key)) ?? (await getProjectById(key));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await resolve(decodeURIComponent(id));
  if (!project) return { title: 'Asset not found · ProtoRWA' };
  return {
    title: `${project.title} · Claim trading terminal`,
    description: project.tagline,
  };
}

export default async function ClaimTerminalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await resolve(decodeURIComponent(id));
  if (!project) notFound();
  return <ClaimTradingTerminal project={project} />;
}
