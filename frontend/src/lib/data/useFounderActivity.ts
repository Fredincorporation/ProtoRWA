'use client';

/**
 * FounderActivity read + write hooks.
 *
 * These sit on top of the pure shapes in `founders.ts` and are the only place
 * the wallet talks to the social contract. Two rules drive the design:
 *
 *  1. Honest fallback. When FounderActivity is not deployed for the chain, every
 *     read resolves to the curated demo data (`founders.ts`) rather than a blank
 *     or a fake "live" card. Callers get a `source` so the UI can label it.
 *  2. Content lives on IPFS. The chain returns CIDs; the heavy text is fetched
 *     from the gateway in an effect and merged in, so a slow gateway degrades to
 *     an honest "loading / unavailable" row, never a fabricated body.
 */

import * as React from 'react';
import {
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { founderActivityAbi, type Address, type Project } from '@protorwa/shared';

import { protocolChain } from '@/lib/wagmi';
import {
  activityAddress,
  decorateFeedProjects,
  demoFollowFeed,
  founderDisplayName,
  fetchIpfsJson,
  isActivityDeployed,
  type FeedItem,
  type FounderProfileDoc,
  type UpdateDoc,
} from '@/lib/data/founders';

/** viem decodes the on-chain `Update` struct into this named shape. */
interface RawUpdate {
  id: bigint;
  projectId: bigint;
  author: Address;
  cid: string;
  ts: bigint;
}

function secondsToIso(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toISOString();
}

/* ------------------------------------------------------------------ *
 * IPFS document resolution (shared across feed + profile)
 * ------------------------------------------------------------------ */

/**
 * Resolve a set of CIDs to parsed JSON docs, keyed by CID.
 *
 * Fetches once per (sorted) CID list; a changed list refetches. Failures are
 * simply absent from the map, so callers render an honest placeholder for any
 * doc the gateway did not return.
 */
function useIpfsDocs<T>(cids: string[]): { docs: Record<string, T>; loading: boolean } {
  const key = React.useMemo(() => [...new Set(cids)].sort().join('|'), [cids]);
  const [docs, setDocs] = React.useState<Record<string, T>>({});
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const list = key ? key.split('|') : [];
    if (list.length === 0) {
      setDocs({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      list.map(async (cid) => [cid, await fetchIpfsJson<T>(cid)] as const),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, T> = {};
      for (const [cid, doc] of entries) if (doc) next[cid] = doc;
      setDocs(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { docs, loading };
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

export interface FounderProfileRead {
  registered: boolean;
  profileCid: string;
  followers: number;
  updates: number;
  loading: boolean;
  deployed: boolean;
  refetch: () => void;
}

/** Raw getFounder() read for one address. */
export function useFounderProfileRead(address: Address | undefined): FounderProfileRead {
  const activity = activityAddress();
  const deployed = isActivityDeployed() && Boolean(address);

  const read = useReadContract({
    address: activity,
    abi: founderActivityAbi,
    functionName: 'getFounder',
    args: address ? [address] : undefined,
    chainId: protocolChain.id,
    query: { enabled: deployed },
  });

  const data = read.data as
    | readonly [boolean, string, bigint, bigint]
    | undefined;

  return {
    registered: Boolean(data?.[0]),
    profileCid: (data?.[1] as string) ?? '',
    followers: data ? Number(data[2]) : 0,
    updates: data ? Number(data[3]) : 0,
    loading: deployed && read.isLoading,
    deployed: Boolean(activity),
    refetch: read.refetch,
  };
}

/** Founder identity merged from the on-chain profile pointer + its IPFS doc. */
export interface FounderDisplay {
  address: Address;
  displayName: string;
  bio: string | null;
  avatarCid: string | null;
  handle: string;
  followers: number | null;
  registered: boolean;
  source: 'live' | 'demo';
}

/**
 * Display-ready founder identity, with a demo fallback.
 *
 * Live when FounderActivity is deployed AND the address is a registered founder
 * with data; otherwise the curated demo metadata from `founders.ts`. This is the
 * hook the profile header and follow buttons use.
 */
export function useFounderDisplay(address: Address): FounderDisplay {
  const profile = useFounderProfileRead(address);
  const doc = useIpfsDocs<FounderProfileDoc>(profile.profileCid ? [profile.profileCid] : []);
  const profileDoc = profile.profileCid ? doc.docs[profile.profileCid] : undefined;

  const live = profile.registered;
  return {
    address,
    displayName: profileDoc?.displayName ?? founderDisplayName(address),
    bio: profileDoc?.bio ?? null,
    avatarCid: profileDoc?.avatarCid ?? null,
    handle: profileDoc?.handle ?? founderDisplayName(address),
    followers: live ? profile.followers : null,
    registered: profile.registered,
    source: live ? 'live' : 'demo',
  };
}

/** Whether `viewer` follows `founder` (false when not deployed / no wallet). */
export function useIsFollowing(
  viewer: Address | undefined,
  founder: Address,
): { following: boolean; loading: boolean; refetch: () => void } {
  const activity = activityAddress();
  const read = useReadContract({
    address: activity,
    abi: founderActivityAbi,
    functionName: 'isFollowing',
    args: viewer ? [viewer, founder] : undefined,
    chainId: protocolChain.id,
    query: { enabled: Boolean(activity && viewer) },
  });
  return { following: Boolean(read.data), loading: read.isLoading, refetch: read.refetch };
}

/** Addresses `viewer` follows, straight from the on-chain follow list. */
export function useFollowing(viewer: Address | undefined): {
  addresses: Address[];
  loading: boolean;
  deployed: boolean;
} {
  const activity = activityAddress();
  const deployed = Boolean(activity);
  const read = useReadContract({
    address: activity,
    abi: founderActivityAbi,
    functionName: 'getFollowing',
    args: viewer ? [viewer] : undefined,
    chainId: protocolChain.id,
    query: { enabled: deployed && Boolean(viewer) },
  });
  return {
    addresses: (read.data as Address[] | undefined) ?? [],
    loading: deployed && Boolean(viewer) && read.isLoading,
    deployed,
  };
}

/** A single founder's updates, decoded and resolved against IPFS. */
export function useFounderUpdates(
  founder: Address | undefined,
): { items: FeedItem[]; loading: boolean; deployed: boolean; refetch: () => void } {
  const activity = activityAddress();
  const deployed = Boolean(activity);

  const read = useReadContract({
    address: activity,
    abi: founderActivityAbi,
    functionName: 'getFounderUpdates',
    args: founder ? [founder] : undefined,
    chainId: protocolChain.id,
    query: { enabled: deployed && Boolean(founder) },
  });

  const raw = (read.data as readonly RawUpdate[] | undefined) ?? [];
  const resolved = useResolvedUpdates(raw);
  return {
    items: resolved.items,
    loading: deployed && Boolean(founder) && (read.isLoading || resolved.loading),
    deployed,
    refetch: read.refetch,
  };
}

/** Resolve a batch of raw on-chain updates into feed rows with their bodies. */
function useResolvedUpdates(raw: readonly RawUpdate[]): { items: FeedItem[]; loading: boolean } {
  const cids = React.useMemo(() => raw.map((u) => u.cid), [raw]);
  const { docs, loading } = useIpfsDocs<UpdateDoc>(cids);

  const items = React.useMemo<FeedItem[]>(() => {
    return raw
      .map((u) => {
        const doc = docs[u.cid];
        return {
          id: u.id.toString(),
          author: u.author,
          authorName: founderDisplayName(u.author),
          projectId: u.projectId.toString(),
          // Project linkage (slug/title) is filled by callers that know the
          // catalogue; the contract deliberately stores only the id.
          projectSlug: null,
          projectTitle: null,
          title: doc?.title ?? 'Update',
          // A missing pin is shown honestly rather than invented.
          body: doc?.body ?? '',
          attachmentCids: doc?.attachmentCids ?? [],
          createdAt: secondsToIso(u.ts),
          source: 'live' as const,
        };
      })
      .reverse(); // contract appends oldest-first; feeds want newest first.
  }, [raw, docs]);

  return { items, loading };
}

/**
 * The investor follow feed: updates from every founder the viewer follows,
 * merged newest-first and linked back to their builds.
 *
 * Degradation is deliberate and honest:
 *  - FounderActivity not deployed -> the curated showcase timeline
 *    (`demoFollowFeed`), each row labelled `demo`, so the surface is never blank
 *    nor pretending to be on-chain.
 *  - Deployed, no wallet -> empty (the component shows a connect prompt).
 *  - Deployed, wallet follows nobody -> empty (the component shows discovery).
 *
 * Follows are read live with a multicall so an arbitrary number of founders is
 * fetched in one round-trip rather than by calling a hook in a loop.
 */
export function useFollowFeed(
  viewer: Address | undefined,
  projects: Project[],
): { items: FeedItem[]; loading: boolean; deployed: boolean; followingCount: number } {
  const activity = activityAddress();
  const deployed = Boolean(activity);
  const active = deployed && Boolean(viewer);

  const followingRead = useReadContract({
    address: activity,
    abi: founderActivityAbi,
    functionName: 'getFollowing',
    args: viewer ? [viewer] : undefined,
    chainId: protocolChain.id,
    query: { enabled: active },
  });
  const following = (followingRead.data as Address[] | undefined) ?? [];

  const updatesRead = useReadContracts({
    contracts: following.map((founder) => ({
      address: activity as Address,
      abi: founderActivityAbi,
      functionName: 'getFounderUpdates',
      args: [founder] as const,
      chainId: protocolChain.id,
    })),
    query: { enabled: active && following.length > 0 },
  });

  const raw = React.useMemo<RawUpdate[]>(() => {
    const results = updatesRead.data ?? [];
    return results.flatMap((r) => (r.status === 'success' ? (r.result as unknown as readonly RawUpdate[]) : []));
  }, [updatesRead.data]);

  const resolved = useResolvedUpdates(raw);

  const items = React.useMemo<FeedItem[]>(() => {
    if (!deployed) return demoFollowFeed(projects);
    return decorateFeedProjects(resolved.items, projects);
  }, [deployed, resolved.items, projects]);

  return {
    items,
    loading: deployed && active && (followingRead.isLoading || updatesRead.isLoading || resolved.loading),
    deployed,
    followingCount: following.length,
  };
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

/** Shared plumbing for the four FounderActivity writes (same contract). */
function useActivityWrite(functionName: 'follow' | 'unfollow' | 'registerFounder' | 'setProfile' | 'postUpdate') {
  const activity = activityAddress();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const submit = React.useCallback(
    (args: unknown[]) => {
      if (!activity) return;
      // The address is a plain `address` in the ABI (not payable), but the
      // generated abi type wants the exact tuple; cast at the single boundary.
      writeContract({
        address: activity,
        abi: founderActivityAbi,
        functionName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: args as any,
        chainId: protocolChain.id,
      });
    },
    [activity, functionName, writeContract],
  );

  return {
    submit,
    hash,
    isPending,
    error,
    reset,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    deployed: Boolean(activity),
  };
}

export function useFollow() {
  const w = useActivityWrite('follow');
  return { follow: (founder: Address) => w.submit([founder]), ...w };
}

export function useUnfollow() {
  const w = useActivityWrite('unfollow');
  return { unfollow: (founder: Address) => w.submit([founder]), ...w };
}

export function useRegisterFounder() {
  const w = useActivityWrite('registerFounder');
  return { register: (projectId: bigint) => w.submit([projectId]), ...w };
}

export function useSetProfile() {
  const w = useActivityWrite('setProfile');
  return { setProfile: (cid: string) => w.submit([cid]), ...w };
}

/** postUpdate(projectId, cid). `cid` is the pinned IPFS update doc. */
export function usePostUpdate() {
  const w = useActivityWrite('postUpdate');
  return { postUpdate: (projectId: bigint, cid: string) => w.submit([projectId, cid]), ...w };
}
