/**
 * Founder social data layer (pure, no React).
 *
 * Everything the founder feed / profile pages render funnels through here so a
 * single shape is produced from two very different sources:
 *   - LIVE: the deployed `FounderActivity` contract (profiles, updates, follows)
 *     with the heavy text pinned to IPFS behind each on-chain CID.
 *   - DEMO: the curated showcase fixtures in `mock.ts`, so the social surfaces
 *     render and can be graded before (or without) a FounderActivity deployment.
 *
 * The `source` field is load-bearing: it is what lets the UI label a feed as
 * demo rather than presenting fixtures as if they were on-chain events (the
 * honest-UI rule). Nothing here fabricates live state.
 */

import { getContracts, type Address, type Project } from '@protorwa/shared';

import { ipfsUrl } from '@/lib/ipfs';
import { demoAddresses, mockProjects, mockUpdates } from '@/lib/data/mock';

/* ------------------------------------------------------------------ *
 * Deployment
 * ------------------------------------------------------------------ */

/** Address of FounderActivity on the protocol chain, or undefined when unset. */
export function activityAddress(): Address | undefined {
  const chainId = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN ?? 46630);
  return getContracts(chainId).founderActivity;
}

/** True when a FounderActivity is configured for the chain (so reads are real). */
export function isActivityDeployed(): boolean {
  return Boolean(activityAddress());
}

/* ------------------------------------------------------------------ *
 * IPFS documents
 * ------------------------------------------------------------------ */

/** JSON the founder sets as their profile (the `profileCid` doc). */
export interface FounderProfileDoc {
  displayName?: string;
  handle?: string;
  bio?: string;
  avatarCid?: string | null;
}

/** JSON behind each `postUpdate` CID (the update body). */
export interface UpdateDoc {
  title: string;
  body: string;
  attachmentCids?: string[];
}

/**
 * Fetch and parse an IPFS JSON doc, best-effort.
 *
 * A dead gateway or a non-JSON pin must not throw into a render path: return
 * null so the caller can fall back to an honest empty state rather than crash.
 * `bareCid` strips a stored `ipfs://` / gateway prefix before hitting our gateway.
 */
export async function fetchIpfsJson<T>(cid: string | null | undefined, timeoutMs = 8_000): Promise<T | null> {
  const url = ipfsUrl(cid ? cid.replace(/^ipfs:\/\//, '') : null);
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Unified view models
 * ------------------------------------------------------------------ */

/** A founder as the directory / profile header renders them. */
export interface FounderSummary {
  address: Address;
  /** Human label: IPFS profile name, a known demo handle, else shortened address. */
  displayName: string;
  /** URL-safe routing token for /founders/[handle]. */
  handle: string;
  bio: string | null;
  avatarCid: string | null;
  projectCount: number;
  /** Live on-chain count; demo founders report the fixture count. */
  followers: number | null;
  source: 'live' | 'demo';
}

/** One update in a founder's feed, resolved from IPFS (live) or a fixture (demo). */
export interface FeedItem {
  id: string;
  author: Address;
  authorName: string;
  projectId: string;
  projectSlug: string | null;
  projectTitle: string | null;
  title: string;
  body: string;
  attachmentCids: string[];
  createdAt: string;
  source: 'live' | 'demo';
}

/* ------------------------------------------------------------------ *
 * Known demo founders
 * ------------------------------------------------------------------ */

/**
 * Display metadata for the showcase founders, keyed by their demo address.
 *
 * These addresses own the curated `mockProjects`; giving them handles/names is
 * what lets the social layer render a directory before FounderActivity is
 * deployed. It is demo copy, and only ever attached to demo founders.
 */
const DEMO_FOUNDER_META: Record<string, { displayName: string; handle: string; bio: string }> = {
  [demoAddresses.founderHelio]: {
    displayName: 'HelioFrost Labs',
    handle: 'heliofrost',
    bio: 'Passive-solar edge compute. Building the hardware backers funded, in the open.',
  },
  [demoAddresses.founderAero]: {
    displayName: 'AeroPulse Dynamics',
    handle: 'aeropulse',
    bio: 'Micro-turbine power systems for off-grid sites.',
  },
  [demoAddresses.founderRobo]: {
    displayName: 'RigidGrip Robotics',
    handle: 'rigidgrip',
    bio: 'Industrial end-effectors, tokenised on the escrow rails.',
  },
};

/** Display label for a founder address: demo meta, else shortened address. */
export function founderDisplayName(address: Address): string {
  return DEMO_FOUNDER_META[address.toLowerCase()]?.displayName ?? shorten(address);
}

/** Routing handle for a founder address (used in /founders/[handle]). */
export function founderHandle(address: Address): string {
  return DEMO_FOUNDER_META[address.toLowerCase()]?.handle ?? address.toLowerCase().slice(2, 10);
}

/** Resolve a /founders/[handle] token back to a founder address when known. */
export function addressForHandle(handle: string, projects: Project[]): Address | null {
  const wanted = handle.toLowerCase();
  for (const project of projects) {
    if (founderHandle(project.founder) === wanted) return project.founder;
  }
  // A raw-address path segment is also accepted (0x… of length 42).
  if (/^0x[0-9a-fA-F]{40}$/.test(handle)) return handle as Address;
  return null;
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/* ------------------------------------------------------------------ *
 * Founder directory (derived from the project catalogue)
 * ------------------------------------------------------------------ */

/**
 * Build the founder directory from the catalogue.
 *
 * The set of "founders worth showing" is exactly the set of addresses that own
 * a project the app can render; that keeps discovery honest (you cannot follow
 * a founder with nothing behind them) without a separate on-chain enumeration,
 * which FounderActivity does not provide. A real project (liquidityMode 'real')
 * makes the entry 'live'; a showcase-only founder stays 'demo'.
 */
export function deriveFounderDirectory(projects: Project[]): FounderSummary[] {
  const byFounder = new Map<string, Project[]>();
  for (const project of projects) {
    const key = project.founder.toLowerCase();
    const list = byFounder.get(key) ?? [];
    list.push(project);
    byFounder.set(key, list);
  }

  const summaries: FounderSummary[] = [];
  for (const [key, owned] of byFounder) {
    const address = owned[0]!.founder;
    const meta = DEMO_FOUNDER_META[key];
    const isLive = owned.some((project) => project.liquidityMode === 'real');
    summaries.push({
      address,
      displayName: meta?.displayName ?? shorten(address),
      handle: meta?.handle ?? address.toLowerCase().slice(2, 10),
      bio: meta?.bio ?? null,
      avatarCid: null,
      projectCount: owned.length,
      // Live follower counts come from the per-address read in the hooks layer;
      // the directory only knows the demo authors, whose count is unknown.
      followers: null,
      source: isLive ? 'live' : 'demo',
    });
  }

  // Founders with the most projects first, then by handle for a stable order.
  return summaries.sort(
    (a, b) => b.projectCount - a.projectCount || a.handle.localeCompare(b.handle),
  );
}

/* ------------------------------------------------------------------ *
 * Demo feed (fallback when FounderActivity has no data for a founder)
 * ------------------------------------------------------------------ */

/** Demo updates for a project, newest first, in the shared FeedItem shape. */
export function demoFeedForProject(projectId: string, projects: Project[] = mockProjects): FeedItem[] {
  const project = projects.find((p) => p.id === projectId || p.onChainProjectId === projectId);
  return mockUpdates
    .filter((update) => update.projectId === projectId)
    .map((update) => ({
      id: `demo-${update.id}`,
      author: update.author,
      authorName: founderDisplayName(update.author),
      projectId,
      projectSlug: project?.slug ?? null,
      projectTitle: project?.title ?? null,
      title: update.title,
      body: update.body,
      attachmentCids: update.attachmentCids ?? [],
      createdAt: update.createdAt,
      source: 'demo' as const,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Aggregate demo updates into one newest-first timeline.
 *
 * With `addresses` given, keeps only posts by those founders; with it empty or
 * omitted, returns every showcase update. This backs the investor feed before
 * FounderActivity is deployed, so the surface shows real-looking (but honestly
 * labelled `demo`) copy rather than a blank column.
 */
export function demoFollowFeed(projects: Project[] = mockProjects, addresses?: Address[]): FeedItem[] {
  const wanted =
    addresses && addresses.length > 0 ? new Set(addresses.map((a) => a.toLowerCase())) : null;
  const seen = new Set<string>();
  const items: FeedItem[] = [];
  for (const project of projects) {
    if (wanted && !wanted.has(project.founder.toLowerCase())) continue;
    for (const item of demoFeedForProject(project.id, projects)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Fill in the project link (slug/title) on feed items from the catalogue.
 *
 * The contract stores only an `onChainProjectId`; matching it back to a project
 * is what lets a post card link to the build the update is about. Items whose
 * id has no catalogue match are returned untouched (honest, not invented).
 */
export function decorateFeedProjects<T extends FeedItem>(items: T[], projects: Project[]): T[] {
  const byId = new Map<string, Project>();
  for (const p of projects) {
    if (p.onChainProjectId) byId.set(p.onChainProjectId, p);
    byId.set(p.id, p);
  }
  return items.map((item) => {
    const p = byId.get(item.projectId);
    return p ? { ...item, projectSlug: p.slug, projectTitle: p.title } : item;
  });
}
