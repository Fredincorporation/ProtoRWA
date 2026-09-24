'use client';

import { useReadContract } from 'wagmi';

import { protocolChain } from '@/lib/wagmi';
import {
  getContracts,
  isDeployed,
  milestoneEscrowAbi,
  projectRegistryAbi,
} from '@protorwa/shared';

/**
 * On-chain privilege reads for the connected address.
 *
 * The oversight terminal moves other people's escrowed capital, so the honest
 * gate is "does THIS address hold the role on THIS deployment", not a UI
 * allowlist. These reads mirror the access control the contracts actually
 * enforce (`hasRole(ORACLE_ROLE, msg.sender)` on MilestoneEscrow, and the
 * equivalent ADMIN grant on ProjectRegistry), so a button is only offered when
 * the transaction behind it can succeed.
 *
 * Each role constant (`ORACLE_ROLE`, `ADMIN_ROLE`) is itself a view call, so we
 * chain: fetch the bytes32 slot, then test membership against it. `granted` is
 * only true once the membership read has settled; `checking` is true while a
 * read is in flight so callers can show a spinner rather than falsely render
 * "not authorised".
 */

export interface RoleAccess {
  /** True only when the address provably holds the role on-chain. */
  granted: boolean;
  /** A read is still in flight (or the wallet/chain is not ready). */
  checking: boolean;
}

function useEscrowOracleRole(address?: `0x${string}`): RoleAccess {
  const escrow = getContracts(protocolChain.id).milestoneEscrow;
  const deployed = isDeployed(protocolChain.id);
  const enabled = deployed && Boolean(escrow) && Boolean(address);

  const role = useReadContract({
    address: escrow,
    abi: milestoneEscrowAbi,
    functionName: 'ORACLE_ROLE',
    chainId: protocolChain.id,
    query: { enabled },
  });

  const hasRole = useReadContract({
    address: escrow,
    abi: milestoneEscrowAbi,
    functionName: 'hasRole',
    args: escrow && address && role.data !== undefined ? [role.data, address] : undefined,
    chainId: protocolChain.id,
    query: { enabled: enabled && role.data !== undefined },
  });

  return {
    granted: Boolean(hasRole.data),
    checking: Boolean(enabled) && (role.isLoading || hasRole.isLoading || hasRole.data === undefined),
  };
}

function useRegistryAdminRole(address?: `0x${string}`): RoleAccess {
  const registry = getContracts(protocolChain.id).projectRegistry;
  const deployed = isDeployed(protocolChain.id);
  const enabled = deployed && Boolean(registry) && Boolean(address);

  const adminRole = useReadContract({
    address: registry,
    abi: projectRegistryAbi,
    functionName: 'ADMIN_ROLE',
    chainId: protocolChain.id,
    query: { enabled },
  });
  const defaultRole = useReadContract({
    address: registry,
    abi: projectRegistryAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
    chainId: protocolChain.id,
    query: { enabled },
  });

  const isAdmin = useReadContract({
    address: registry,
    abi: projectRegistryAbi,
    functionName: 'hasRole',
    args: registry && address && adminRole.data !== undefined ? [adminRole.data, address] : undefined,
    chainId: protocolChain.id,
    query: { enabled: enabled && adminRole.data !== undefined },
  });
  const isDefaultAdmin = useReadContract({
    address: registry,
    abi: projectRegistryAbi,
    functionName: 'hasRole',
    args:
      registry && address && defaultRole.data !== undefined
        ? [defaultRole.data, address]
        : undefined,
    chainId: protocolChain.id,
    query: { enabled: enabled && defaultRole.data !== undefined },
  });

  const settled = adminRole.data !== undefined && defaultRole.data !== undefined;
  return {
    granted: Boolean(isAdmin.data || isDefaultAdmin.data),
    checking: Boolean(enabled) && (!settled || isAdmin.isLoading || isDefaultAdmin.isLoading),
  };
}

/**
 * Combined operator view for a connected address.
 *
 * `canOracle` gates escalate / oracleResolve on the escrow; `canManage` gates
 * setProjectStatus on the registry. The deployer key holds both on this testnet.
 */
export function useOperatorAccess(address?: `0x${string}`) {
  const canOracle = useEscrowOracleRole(address);
  const canManage = useRegistryAdminRole(address);
  return {
    canOracle,
    canManage,
    checking: canOracle.checking || canManage.checking,
  };
}
