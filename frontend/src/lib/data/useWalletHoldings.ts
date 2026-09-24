'use client';

/**
 * Live claim holdings for the connected wallet.
 *
 * The "which projects has this wallet actually participated in?" question is
 * answered on-chain: ClaimToken is an ERC-1155 whose token id equals the on-chain
 * project id, so `balanceOf(wallet, projectId)` is the number of claim units held.
 * A non-zero balance is real, verifiable participation - the basis for the
 * investor dashboard's holdings-filtered secondary market.
 *
 * This is the *real* pipeline. Demo showcase projects carry no on-chain escrow, so
 * they are excluded from the read; where a demo position is needed for the offline
 * showcase it is labelled as such by the caller (see `mockPositions`).
 */

import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';

import { claimTokenAbi, getContracts, isDeployed, type Project } from '@protorwa/shared';
import { protocolChain } from '@/lib/wagmi';

export interface WalletHoldings {
  /** Claim units held, keyed by on-chain project id (decimal string). */
  byProjectId: Map<string, bigint>;
  /** The connected wallet holds a non-zero live balance in at least one project. */
  hasAny: boolean;
  /** A ClaimToken is deployed on the protocol chain. */
  deployed: boolean;
  connected: boolean;
  loading: boolean;
}

/** Real projects carry an `onChainProjectId` equal to their ClaimToken id. */
function liveId(project: Project): string | null {
  if (project.liquidityMode !== 'real') return null;
  return project.onChainProjectId ?? null;
}

export function useWalletHoldings(
  address: string | undefined,
  projects: Project[],
): WalletHoldings {
  const claimToken = getContracts(protocolChain.id).claimToken as `0x${string}` | undefined;
  const deployed = Boolean(claimToken) && isDeployed(protocolChain.id);
  const connected = Boolean(address);

  const live = useMemo(
    () =>
      projects
        .map((p) => ({ project: p, id: liveId(p) }))
        .filter((entry): entry is { project: Project; id: string } => entry.id !== null),
    [projects],
  );

  const enabled = deployed && connected && live.length > 0;

  const { data, isLoading } = useReadContracts({
    allowFailure: true,
    contracts: live.map((entry) => ({
      address: claimToken as `0x${string}`,
      abi: claimTokenAbi,
      functionName: 'balanceOf' as const,
      args: [address as `0x${string}`, BigInt(entry.id)] as const,
    })),
    query: { enabled },
  });

  const byProjectId = useMemo(() => {
    const map = new Map<string, bigint>();
    live.forEach((entry, index) => {
      const result = data?.[index];
      if (result?.status === 'success' && typeof result.result === 'bigint') {
        map.set(entry.id, result.result);
      }
    });
    return map;
  }, [data, live]);

  const hasAny = useMemo(() => [...byProjectId.values()].some((amount) => amount > 0n), [byProjectId]);

  return { byProjectId, hasAny, deployed, connected, loading: enabled && isLoading };
}
