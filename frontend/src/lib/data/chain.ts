/**
 * Live on-chain project reads.
 *
 * Turns the deployed `ProjectRegistry` + `MilestoneEscrow` state into the same
 * `Project` shape the demo data layer produces (`mock.ts`), so every screen that
 * renders a `Project` works unchanged against real commitments.
 *
 * Server-only. It talks to the protocol RPC with a bare viem public client rather
 * than wagmi hooks because it runs inside React Server Components (the project
 * and explore pages), where there is no wallet provider. All money is read as
 * USDG base units (6 decimals) - the escrow is USDG-denominated, so a wei-scale
 * assumption would be off by 10^12.
 *
 * The whole module degrades to an empty list on any failure: an unreachable RPC
 * or an undeployed registry must hide live projects, not crash the page or
 * render a half-populated card with a misleading zero escrow.
 */

import { createPublicClient, http } from 'viem';

import {
  defaultChain,
  getContracts,
  isDeployed,
  milestoneEscrowAbi,
  projectRegistryAbi,
  type Address,
  type BigIntString,
  type IndustryCategory,
  type Milestone,
  type Project,
  type ProjectStatus,
} from '@protorwa/shared';

import { ipfsUrl } from '@/lib/ipfs';

/** Enum ordinals, matching ProjectRegistry.sol exactly. Off-by-one here silently mislabels every card. */
const PROJECT_STATUS: readonly ProjectStatus[] = [
  'DRAFT',
  'FUNDING',
  'IN_PRODUCTION',
  'COMPLETED',
  'CANCELLED',
  'DEFAULTED',
];

/**
 * Vote weights on `Milestone.votes` are rendered by the quorum meter as
 * "claims" after a divide-by-1e6, and the mock layer stores them in that
 * 6-decimal (USDG-base-unit) convention. On-chain `eligibleWeight` / vote
 * weights are whole claim counts, so live values are scaled by 1e6 here to keep
 * one unit convention across demo and live projects.
 */
const VOTE_WEIGHT_SCALE = 10n ** 6n;

/** The JSON document the founder wizard pins and stores as `metadataCid`. */
interface ProjectMetadata {
  name?: string;
  description?: string;
  image?: string | null;
  gallery?: string[];
  video?: string | null;
  category?: string;
  location?: string;
}

/** viem needs a `Chain`; shared only exposes its own `ChainConfig`, so bridge the two. */
function publicClient() {
  const chain = {
    id: defaultChain.id,
    name: defaultChain.name,
    nativeCurrency: defaultChain.nativeCurrency,
    rpcUrls: { default: { http: [defaultChain.rpcUrl] }, public: { http: [defaultChain.rpcUrl] } },
  } as const;
  // Public testnet RPCs intermittently stall on `eth_call`. Fail fast (no retries,
  // short per-call timeout) so a hung node degrades to the [] fallback instead of
  // pinning a whole page's server render - see the deadline in fetchLiveProjects.
  return createPublicClient({ chain, transport: http(defaultChain.rpcUrl, { timeout: 6_000, retryCount: 0 }) });
}

function toIso(seconds: number | bigint): string {
  return new Date(Number(seconds) * 1000).toISOString();
}

/** Casts a base-unit integer into the domain's decimal-string alias. */
function bi(value: bigint | number | string): BigIntString {
  return String(value) as BigIntString;
}

function slugify(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base ? `${base}-${id}` : `project-${id}`;
}

function normalizeCategory(value: string | undefined): IndustryCategory {
  const upper = (value ?? '').toUpperCase();
  const allowed: IndustryCategory[] = [
    'COMPUTE',
    'ENERGY',
    'ROBOTICS',
    'SENSORS',
    'MOBILITY',
    'BIOTECH',
    'MANUFACTURING',
    'OTHER',
  ];
  return (allowed as string[]).includes(upper) ? (upper as IndustryCategory) : 'OTHER';
}

/** Strips an `ipfs://` / gateway prefix so a stored ref renders through our gateway. */
function bareCid(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const bare = ref.replace(/^ipfs:\/\//, '').replace(/^https?:\/\/[^/]+\/ipfs\//, '').replace(/^\/+/, '');
  return bare || null;
}

async function fetchMetadata(metadataCid: string): Promise<ProjectMetadata> {
  const url = ipfsUrl(bareCid(metadataCid) ?? metadataCid);
  if (!url) return {};
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return {};
    return (await response.json()) as ProjectMetadata;
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ *
 * Coarse cache
 * ------------------------------------------------------------------ */

const CACHE_TTL_MS = 20_000;
/**
 * Ceiling on a full live read. Each `eth_call` already fails after 6s, but the
 * fan-out is sequential-dependent, so a stalled RPC is bounded here rather than
 * allowed to pin a page's server render for a minute or more.
 */
const READ_DEADLINE_MS = 8_000;
let cache: { at: number; value: Project[] } | null = null;
let inflight: Promise<Project[]> | null = null;

/**
 * Reads every project the registry has ever created.
 *
 * Batched into a handful of round trips (one multicall per data shape) because
 * per-field `eth_call`s over a public testnet RPC add up fast and would make the
 * listing page crawl. Returns [] when the chain has no deployment or is
 * unreachable - callers treat that as "no live projects yet".
 */
export async function fetchLiveProjects(): Promise<Project[]> {
  const registry = getContracts(defaultChain.id).projectRegistry;
  const escrow = getContracts(defaultChain.id).milestoneEscrow;
  if (!registry || !escrow || !isDeployed(defaultChain.id)) return [];

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  if (inflight) return inflight;

  inflight = withDeadline(readProjects(registry as Address, escrow as Address), READ_DEADLINE_MS)
    .then((projects) => {
      cache = { at: Date.now(), value: projects };
      return projects;
    })
    .catch((error) => {
      console.warn('[chain] live project read failed/timed out; falling back to demo data.', error);
      return cache?.value ?? [];
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/**
 * Rejects after `ms` so a stalled RPC cannot hang the caller indefinitely.
 * The losing read keeps running but is ignored; the caller's cache keeps the
 * last good value, so a transient stall only affects first paint.
 */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`live read exceeded ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function readProjects(registry: Address, escrow: Address): Promise<Project[]> {
  const client = publicClient();

  const nextId = await client.readContract({
    address: registry,
    abi: projectRegistryAbi,
    functionName: 'nextProjectId',
  });

  // Ids start at 1; nextProjectId is the id the *next* create will use.
  const total = Number(nextId);
  if (total <= 1) return [];
  const ids = Array.from({ length: total - 1 }, (_, i) => BigInt(i + 1));

  // Robinhood Testnet has no multicall3 deployment, and viem's `multicall` then
  // probes it, fails and retries, which added ~75s to the first page render. Read
  // each field with plain `eth_call`s instead, run in parallel and guarded so one
  // missing record cannot reject the whole batch.
  const tryRead = <T,>(read: () => Promise<T>): Promise<T | null> =>
    read().catch(() => null);

  const [projectRows, milestoneRows, lockedRows, refundedRows] = await Promise.all([
    Promise.all(
      ids.map((id) =>
        tryRead(() =>
          client.readContract({
            address: registry,
            abi: projectRegistryAbi,
            functionName: 'getProject',
            args: [id],
          }),
        ),
      ),
    ),
    Promise.all(
      ids.map((id) =>
        tryRead(() =>
          client.readContract({
            address: registry,
            abi: projectRegistryAbi,
            functionName: 'getMilestones',
            args: [id],
          }),
        ),
      ),
    ),
    Promise.all(
      ids.map((id) =>
        tryRead(() =>
          client.readContract({
            address: escrow,
            abi: milestoneEscrowAbi,
            functionName: 'escrowBalance',
            args: [id],
          }),
        ),
      ),
    ),
    Promise.all(
      ids.map((id) =>
        tryRead(() =>
          client.readContract({
            address: escrow,
            abi: milestoneEscrowAbi,
            functionName: 'totalRefunded',
            args: [id],
          }),
        ),
      ),
    ),
  ]);

  // Per-milestone released amounts: (projectId, index) pairs, re-grouped by
  // project so a project's released total is the sum of its own tranches.
  const pairs: Array<{ id: bigint; milestone: number }> = [];
  for (const [projectIndex, list] of milestoneRows.entries()) {
    if (!Array.isArray(list)) continue;
    for (let m = 0; m < list.length; m += 1) {
      pairs.push({ id: ids[projectIndex]!, milestone: m });
    }
  }

  const releasedRows =
    pairs.length === 0
      ? []
      : await Promise.all(
          pairs.map((pair) =>
            tryRead(() =>
              client.readContract({
                address: escrow,
                abi: milestoneEscrowAbi,
                functionName: 'released',
                args: [pair.id, BigInt(pair.milestone)],
              }),
            ),
          ),
        );

  // Per-milestone escrow review: the authoritative live milestone state. The
  // registry's own Milestone.status is never advanced by the escrow, so the
  // review (open / weights / outcome) plus `released` is what a real milestone
  // actually looks like - see MilestoneEscrow.sol (no write-back to registry).
  const reviewRows =
    pairs.length === 0
      ? []
      : await Promise.all(
          pairs.map((pair) =>
            tryRead(() =>
              client.readContract({
                address: escrow,
                abi: milestoneEscrowAbi,
                functionName: 'getReview',
                args: [pair.id, BigInt(pair.milestone)],
              }),
            ),
          ),
        );

  const releasedByProject = new Map<string, bigint>();
  for (const [index, pair] of pairs.entries()) {
    const amount = releasedRows[index];
    if (typeof amount === 'bigint') {
      const key = pair.id.toString();
      releasedByProject.set(key, (releasedByProject.get(key) ?? 0n) + amount);
    }
  }

  const reviewByPair = new Map<string, Record<string, unknown>>();
  for (const [index, pair] of pairs.entries()) {
    const review = reviewRows[index];
    if (review && typeof review === 'object') {
      reviewByPair.set(`${pair.id}:${pair.milestone}`, review as Record<string, unknown>);
    }
  }


  const projects = await Promise.all(
    projectRows.map(async (row, index) => {
      if (!row) return null;
      const p = row as Record<string, unknown>;
      const idStr = String(p.id as bigint);
      const title = String(p.title ?? '');
      // An unset record has an empty title; skip it so we never render a ghost card.
      if (!title || title.length === 0) return null;

      const milestoneList = Array.isArray(milestoneRows[index])
        ? (milestoneRows[index] as readonly Record<string, unknown>[])
        : [];

      const milestones: Milestone[] = milestoneList.map((m, mi) => {
        const review = reviewByPair.get(`${idStr}:${mi}`);
        const outcome = review ? Number(review.outcome ?? 0) : 0;
        const isOpen = review ? Boolean(review.open) : false;
        const snapshotAt = review ? BigInt((review.snapshotAt as bigint) ?? 0n) : 0n;
        const endsAt = review ? BigInt((review.endsAt as bigint) ?? 0n) : 0n;
        const eligibleWeight = review ? BigInt((review.eligibleWeight as bigint) ?? 0n) : 0n;
        const approveWeight = review ? BigInt((review.approveWeight as bigint) ?? 0n) : 0n;
        const rejectWeight = review ? BigInt((review.rejectWeight as bigint) ?? 0n) : 0n;
        const abstainWeight = review ? BigInt((review.abstainWeight as bigint) ?? 0n) : 0n;

        // ReviewOutcome: 0 NONE, 1 PENDING (escalated), 2 APPROVED, 3 REJECTED.
        // The escrow never writes status back to the registry, so this - not the
        // registry milestone ordinal - is the single source of truth for a live
        // milestone. An open-but-expired review stays EVIDENCE (settleable).
        let status: Milestone['status'];
        if (outcome === 2) status = 'APPROVED';
        else if (outcome === 3) status = 'REJECTED';
        else if (isOpen) status = 'EVIDENCE';
        else status = 'PENDING';

        // Before any review opens there is no snapshot yet; fall back to the
        // committed claim count so the meter shows the standing electorate.
        const electorate = eligibleWeight > 0n ? eligibleWeight : (p.claimsCommitted as bigint) ?? 0n;

        return {
          index: mi,
          title: String(m.title ?? `Milestone ${mi + 1}`),
          description: String(m.description ?? ''),
          trancheAmount: bi((m.trancheAmount as bigint) ?? 0n),
          dueAt: toIso((m.dueAt as bigint) ?? 0n),
          status,
          votingPeriodSeconds: Number(m.votingPeriodSeconds ?? 0),
          votingEndsAt: snapshotAt > 0n && endsAt > 0n ? toIso(endsAt) : null,
          approvalThresholdBps: Number(m.approvalThresholdBps ?? 0),
          quorumBps: Number(m.quorumBps ?? 0),
          votes: {
            approve: bi(approveWeight * VOTE_WEIGHT_SCALE),
            reject: bi(rejectWeight * VOTE_WEIGHT_SCALE),
            abstain: bi(abstainWeight * VOTE_WEIGHT_SCALE),
            eligible: bi(electorate * VOTE_WEIGHT_SCALE),
          },
          // Artefacts live in EvidenceSubmitted events, which need an indexer the
          // product does not yet run; the vote tally and window are on-chain and
          // shown, the file list is honestly empty rather than fabricated.
          evidence: [],
          // The Review struct records no settlement timestamp, so approvedAt is
          // left null rather than inventing a date.
          approvedAt: null,
          disputeReason: null,
        };
      });

      const metadata = p.metadataCid ? await fetchMetadata(String(p.metadataCid)) : {};

      const locked = typeof lockedRows[index] === 'bigint' ? bi(lockedRows[index] as bigint) : '0';
      const refunded =
        typeof refundedRows[index] === 'bigint' ? bi(refundedRows[index] as bigint) : '0';

      const project: Project = {
        // `id` is only a React/catalogue key; the authoritative handles are
        // `slug` (routing) and `onChainProjectId` (chain ops). Namespacing it
        // keeps a live project's key from colliding with a curated demo row
        // that reuses the same small display index (mock ids are '1'|'2'|'3').
        id: `live-${idStr}`,
        slug: slugify(title, idStr),
        title,
        tagline: String(p.tagline ?? ''),
        description:
          (metadata.description ?? '').trim() ||
          String(p.tagline ?? '') ||
          'No description published for this project.',
        status: PROJECT_STATUS[Number(p.status ?? 0)] ?? 'DRAFT',
        category: normalizeCategory(metadata.category),
        founder: (p.founder as Address) ?? '0x0000000000000000000000000000000000000000',
        manufacturingLocation: metadata.location ?? '',
        coverCid: bareCid(String(p.coverCid ?? '')) ?? bareCid(metadata.image) ?? '',
        galleryCids: (metadata.gallery ?? []).map((g) => bareCid(g)).filter((g): g is string => Boolean(g)),
        pitchVideoCid: bareCid(metadata.video),
        claimPrice: bi((p.claimPrice as bigint) ?? 0n),
        totalClaims: bi((p.totalClaims as bigint) ?? 0n),
        claimsCommitted: bi((p.claimsCommitted as bigint) ?? 0n),
        claimTokenId: idStr as BigIntString,
        escrow: {
          totalCommitted: bi((p.totalCommitted as bigint) ?? 0n),
          totalReleased: bi(releasedByProject.get(idStr) ?? 0n),
          totalRefunded: refunded,
          locked,
          target: bi((p.target as bigint) ?? 0n),
          fundingDeadline: toIso((p.fundingDeadline as bigint) ?? 0n),
        },
        milestones,
        createdAt: toIso((p.createdAt as bigint) ?? 0n),
        updatedAt: toIso((p.updatedAt as bigint) ?? 0n),
        liquidityMode: 'real',
        onChainProjectId: idStr,
      };
      return project;
    }),
  );

  return projects.filter((p): p is Project => p !== null);
}
