/**
 * Guards the catalogue-key invariant that fixes the `/explore` duplicate-key
 * crash: a live project's `id` must never reuse the small display index a curated
 * demo row carries (demo ids are '1' | '2' | '3'). `id` is only a React/catalogue
 * key, so chain.ts namespaces it (`live-<n>`) while `onChainProjectId` stays the
 * raw numeric the rest of the app uses for chain ops. If the prefix is dropped,
 * demo and live rows collide and React warns about duplicate keys.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('viem', () => ({
  createPublicClient: () => ({ readContract }),
  http: () => ({}),
}));

vi.mock('@protorwa/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@protorwa/shared')>();
  return {
    ...actual,
    isDeployed: () => true,
    defaultChain: {
      id: 46630,
      name: 'Robinhood Testnet',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrl: 'https://rpc.testnet.chain.robinhood.com',
    },
    getContracts: () => ({
      projectRegistry: '0x0000000000000000000000000000000000000001',
      milestoneEscrow: '0x0000000000000000000000000000000000000002',
    }),
  };
});

/** viem's per-field reader, faked by function name so readProjects runs offline. */
async function readContract({
  functionName,
  args,
}: {
  functionName: string;
  args?: readonly unknown[];
}): Promise<unknown> {
  if (functionName === 'nextProjectId') return 4n; // ids 1, 2, 3 exist on-chain.
  if (functionName === 'getProject') {
    const id = args?.[0] as bigint;
    return {
      id,
      founder: '0x0000000000000000000000000000000000000009',
      title: `On-chain build ${id}`,
      tagline: '',
      metadataCid: '',
      coverCid: '',
      claimPrice: 1n,
      totalClaims: 1n,
      claimsCommitted: 0n,
      target: 1n,
      totalCommitted: 0n,
      fundingDeadline: 0n,
      createdAt: 0n,
      updatedAt: 0n,
      status: projectStatuses.get(id.toString()) ?? 0,
    };
  }
  if (functionName === 'getMilestones') return [];
  return 0n; // escrowBalance / totalRefunded / released / getReview
}

/** Per-id registry status ordinals the faked reader returns; defaults to DRAFT (0). */
const projectStatuses = new Map<string, number>();

const { mockProjects } = await import('@/lib/data/mock');

describe('live project catalogue keys', () => {
  beforeEach(() => {
    vi.resetModules();
    projectStatuses.clear();
  });

  it('namespaces live project ids so they never collide with demo display ids', async () => {
    const { fetchLiveProjects } = await import('@/lib/data/chain');
    const live = await fetchLiveProjects();
    expect(live.length).toBeGreaterThan(0);

    // Each live row keeps the raw on-chain id but exposes a prefixed catalogue key.
    for (const project of live) {
      expect(project.onChainProjectId).toMatch(/^\d+$/);
      expect(project.id).toBe(`live-${project.onChainProjectId}`);
    }

    // The whole merged catalogue renders with unique React keys.
    const demoIds = mockProjects.map((p) => p.id);
    const liveIds = live.map((p) => p.id);
    const all = [...demoIds, ...liveIds];
    expect(new Set(all).size).toBe(all.length);
  });

  it('drops cancelled and defaulted projects from the live listing', async () => {
    // Registry ordinals: CANCELLED = 4, DEFAULTED = 5 (see ProjectRegistry.sol).
    projectStatuses.set('2', 4); // CANCELLED
    projectStatuses.set('3', 5); // DEFAULTED
    const { fetchLiveProjects } = await import('@/lib/data/chain');
    const live = await fetchLiveProjects();

    // Only the DRAFT row (id 1) survives; the terminal-state seeds vanish so an
    // admin cancellation is reflected without a redeploy.
    expect(live.map((p) => p.onChainProjectId)).toEqual(['1']);
  });
});

