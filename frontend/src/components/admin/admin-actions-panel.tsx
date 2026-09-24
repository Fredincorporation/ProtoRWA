'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';

import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { useOperatorAccess } from '@/lib/data/useOperatorAccess';
import { formatUsdgNumber, shortenAddress } from '@/lib/format';
import { milestoneStatus } from '@/lib/status';
import { protocolChain } from '@/lib/wagmi';
import {
  getContracts,
  isDeployed,
  milestoneEscrowAbi,
  projectRegistryAbi,
  protocolAddressUrl,
  protocolTxUrl,
  type Milestone,
  type Project,
  type ProjectStatus,
} from '@protorwa/shared';

/**
 * Oracle & protocol-administrator write surface.
 *
 * These are the privileged actions the deployed contracts actually expose:
 *
 *   - MilestoneEscrow.escalate(projectId, milestoneIndex, rationaleCid)
 *   - MilestoneEscrow.oracleResolve(projectId, milestoneIndex, release, rationale)
 *   - ProjectRegistry.setProjectStatus(projectId, status)
 *
 * Each is gated on the connected wallet holding the matching on-chain role
 * (ORACLE_ROLE on the escrow; ADMIN_ROLE on the registry), read live via
 * `useOperatorAccess` rather than assumed. That is deliberate: a button here
 * only appears when the transaction behind it can succeed, so the interface
 * never implies authority the signer does not have.
 *
 * Showcase (`liquidityMode !== 'real'`) projects have no on-chain escrow, so
 * every action renders inert and labelled rather than silently disabled.
 */

/** Shared write runner: broadcast, wait for the receipt, surface the outcome. */
function usePrivilegedWrite() {
  const publicClient = usePublicClient({ chainId: protocolChain.id });
  const { writeContractAsync } = useWriteContract();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [txHash, setTxHash] = React.useState<`0x${string}` | null>(null);

  const run = React.useCallback(
    async (fn: () => Promise<`0x${string}`>) => {
      setError(null);
      setTxHash(null);
      setPending(true);
      try {
        const hash = await fn();
        setTxHash(hash);
        if (publicClient) {
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== 'success') {
            throw new Error('The transaction reverted on-chain; nothing changed.');
          }
        }
        return hash;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The transaction failed.');
        return null;
      } finally {
        setPending(false);
      }
    },
    [publicClient, writeContractAsync],
  );

  return { run, pending, error, txHash, writeContractAsync };
}

/** One-line wallet/role status chip shared by both panels. */
function AuthorityState({
  granted,
  checking,
  role,
  connected,
  onChain,
}: {
  granted: boolean;
  checking: boolean;
  role: string;
  connected: boolean;
  onChain: boolean;
}) {
  if (!connected) {
    return <StateLine tone="muted" icon="account_balance_wallet" text={`Connect a wallet to check ${role}.`} />;
  }
  if (checking) {
    return <StateLine tone="muted" icon="autorenew" text={`Checking ${role} on-chain…`} spin />;
  }
  if (!onChain) {
    return <StateLine tone="muted" icon="swap_horiz" text={`Switch to ${protocolChain.name} to act as oracle.`} />;
  }
  if (granted) {
    return <StateLine tone="ok" icon="verified_user" text={`This address holds ${role}. Actions are live.`} />;
  }
  return <StateLine tone="warn" icon="lock" text={`This address does not hold ${role}, so writes are disabled.`} />;
}

function StateLine({
  tone,
  icon,
  text,
  spin,
}: {
  tone: 'ok' | 'warn' | 'muted';
  icon: string;
  text: string;
  spin?: boolean;
}) {
  const color = tone === 'ok' ? 'text-primary' : tone === 'warn' ? 'text-warn' : 'text-outline';
  return (
    <p className={`flex items-start gap-1.5 font-mono text-label-sm ${color}`}>
      <Icon name={icon} size={13} className={`mt-0.5 shrink-0 ${spin ? 'animate-spin' : ''}`} />
      <span>{text}</span>
    </p>
  );
}

function TxLink({ hash }: { hash: `0x${string}` }) {
  return (
    <a
      href={protocolTxUrl(hash) ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-label-sm text-primary hover:underline"
    >
      <Icon name="receipt_long" size={13} />
      {hash.slice(0, 10)}…{hash.slice(-8)}
    </a>
  );
}

/* ------------------------------------------------------------------ *
 * Escrow oracle actions
 * ------------------------------------------------------------------ */

export function OracleMilestoneActions({
  project,
  milestone,
  milestoneIndex,
}: {
  project: Project;
  milestone: Milestone;
  milestoneIndex: number;
}) {
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { canOracle } = useOperatorAccess(address);
  const { run, pending, error, txHash, writeContractAsync } = usePrivilegedWrite();
  const [rationale, setRationale] = React.useState('');

  const escrow = getContracts(protocolChain.id).milestoneEscrow;
  const onChainId = project.onChainProjectId;
  const isReal =
    project.liquidityMode === 'real' && Boolean(onChainId) && Boolean(escrow) && isDeployed(protocolChain.id);
  const onProtocolChain = chainId === protocolChain.id;
  const pid = onChainId !== undefined ? BigInt(onChainId) : 0n;
  const idx = BigInt(milestoneIndex);
  const status = milestoneStatus(milestone.status);

  const canAct = isReal && isConnected && onProtocolChain && canOracle.granted && !pending;
  const trimmed = rationale.trim();

  const act = async (kind: 'escalate' | 'release' | 'refund') => {
    if (!escrow || !canAct) return;
    const hash = await run(() =>
      kind === 'escalate'
        ? writeContractAsync({
            address: escrow,
            abi: milestoneEscrowAbi,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            functionName: 'escalate' as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            args: [pid, idx, trimmed] as any,
            chainId: protocolChain.id,
          })
        : writeContractAsync({
            address: escrow,
            abi: milestoneEscrowAbi,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            functionName: 'oracleResolve' as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            args: [pid, idx, kind === 'release', trimmed] as any,
            chainId: protocolChain.id,
          }),
    );
    if (hash) {
      setRationale('');
      router.refresh();
    }
  };

  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/projects/${project.slug}`}
            className="truncate font-display text-headline-sm text-on-surface hover:text-primary"
          >
            {project.title}
          </Link>
          <span className="font-mono text-label-sm text-outline">
            M{String(milestoneIndex + 1).padStart(2, '0')}
          </span>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <div className="font-mono text-label-sm text-secondary">
          {formatUsdgNumber(milestone.trancheAmount, 2)} USDG
        </div>
      </div>

      {!isReal ? (
        <p className="flex items-start gap-1.5 rounded border border-outline-variant/40 bg-surface-container-lowest p-space-sm font-mono text-label-sm text-outline">
          <Icon name="science" size={13} className="mt-0.5 shrink-0" />
          <span>
            Showcase project on simulated data — there is no live escrow, so oracle actions are not
            available. Only projects published to the registry accept real resolutions.
          </span>
        </p>
      ) : (
        <>
          <AuthorityState
            granted={canOracle.granted}
            checking={canOracle.checking}
            role="ORACLE_ROLE"
            connected={isConnected}
            onChain={onProtocolChain}
          />

          <label className="flex flex-col gap-1">
            <span className="font-mono text-label-sm uppercase tracking-wider text-outline">
              Rationale / evidence CID (stored on-chain with the action)
            </span>
            <textarea
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              rows={2}
              placeholder="e.g. Metrology key #0x4f passed laser inspection; releasing tranche."
              className="rounded border-outline-variant/50 bg-surface-container-lowest p-space-sm font-body-sm text-on-surface outline-none focus:border-primary"
            />
          </label>

          <div className="flex flex-wrap gap-space-sm">
            <Action
              icon="gavel"
              label="Escalate to oracle"
              onClick={() => void act('escalate')}
              disabled={!canAct || trimmed.length === 0}
              pending={pending}
              hint="Open a review period for backer votes; requires ORACLE_ROLE."
            />
            <Action
              icon="lock_open"
              tone="ok"
              label="Resolve · release"
              onClick={() => void act('release')}
              disabled={!canAct || trimmed.length === 0}
              pending={pending}
              hint="oracleResolve(release=true) — pays the tranche to the founder."
            />
            <Action
              icon="currency_exchange"
              tone="danger"
              label="Resolve · refund"
              onClick={() => void act('refund')}
              disabled={!canAct || trimmed.length === 0}
              pending={pending}
              hint="oracleResolve(release=false) — returns the tranche to claim holders."
            />
          </div>

          {!onProtocolChain && isConnected ? (
            <button
              type="button"
              onClick={() => void switchChainAsync({ chainId: protocolChain.id }).catch(() => undefined)}
              className="self-start font-mono text-label-sm text-primary hover:underline"
            >
              Switch to {protocolChain.name}
            </button>
          ) : null}

          {error ? (
            <p className="flex items-start gap-1.5 font-mono text-label-sm text-error">
              <Icon name="error" size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
          {txHash ? (
            <p className="flex items-center gap-1.5 font-mono text-label-sm text-on-surface-variant">
              Broadcast: <TxLink hash={txHash} />
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Registry lifecycle control
 * ------------------------------------------------------------------ */

const LIFECYCLE: Array<{ value: ProjectStatus; code: number }> = [
  { value: 'DRAFT', code: 0 },
  { value: 'FUNDING', code: 1 },
  { value: 'IN_PRODUCTION', code: 2 },
  { value: 'COMPLETED', code: 3 },
  { value: 'CANCELLED', code: 4 },
  { value: 'DEFAULTED', code: 5 },
];

export function ProjectLifecycleControl({ project }: { project: Project }) {
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();
  const { canManage } = useOperatorAccess(address);
  const { run, pending, error, txHash, writeContractAsync } = usePrivilegedWrite();
  const [next, setNext] = React.useState<ProjectStatus>(project.status);

  const registry = getContracts(protocolChain.id).projectRegistry;
  const onChainId = project.onChainProjectId;
  const isReal =
    project.liquidityMode === 'real' && Boolean(onChainId) && Boolean(registry) && isDeployed(protocolChain.id);
  const onProtocolChain = chainId === protocolChain.id;

  const canAct = isReal && isConnected && onProtocolChain && canManage.granted && !pending && next !== project.status;

  const apply = async () => {
    if (!registry || !onChainId || !canAct) return;
    const code = LIFECYCLE.find((entry) => entry.value === next)?.code;
    if (code === undefined) return;
    const hash = await run(() =>
      writeContractAsync({
        address: registry,
        abi: projectRegistryAbi,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        functionName: 'setProjectStatus' as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: [BigInt(onChainId), code] as any,
        chainId: protocolChain.id,
      }),
    );
    if (hash) router.refresh();
  };

  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/projects/${project.slug}`}
            className="truncate font-display text-headline-sm text-on-surface hover:text-primary"
          >
            {project.title}
          </Link>
          {onChainId ? (
            <a
              href={protocolAddressUrl(registry ?? '') ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-label-sm text-outline hover:text-primary"
            >
              #{onChainId}
            </a>
          ) : null}
        </div>
        <span className="font-mono text-label-sm text-outline">
          current: {project.status} · founder {shortenAddress(project.founder, 4)}
        </span>
      </div>

      {!isReal ? (
        <p className="flex items-start gap-1.5 rounded border border-outline-variant/40 bg-surface-container-lowest p-space-sm font-mono text-label-sm text-outline">
          <Icon name="science" size={13} className="mt-0.5 shrink-0" />
          <span>Showcase project — not present on the registry, so its status cannot be changed on-chain.</span>
        </p>
      ) : (
        <>
          <AuthorityState
            granted={canManage.granted}
            checking={canManage.checking}
            role="ADMIN_ROLE"
            connected={isConnected}
            onChain={onProtocolChain}
          />
          <div className="flex flex-wrap items-center gap-space-sm">
            <label className="flex items-center gap-2">
              <span className="font-mono text-label-sm uppercase tracking-wider text-outline">Set status</span>
              <select
                value={next}
                onChange={(event) => setNext(event.target.value as ProjectStatus)}
                disabled={!canManage.granted}
                className="rounded border-outline-variant/50 bg-surface-container-lowest px-space-sm py-1.5 font-mono text-label-sm text-on-surface outline-none focus:border-primary disabled:opacity-50"
              >
                {LIFECYCLE.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.value}
                  </option>
                ))}
              </select>
            </label>
            <Action
              icon="published_with_changes"
              label="Update status"
              onClick={() => void apply()}
              disabled={!canAct}
              pending={pending}
              hint="setProjectStatus() on ProjectRegistry.sol — requires ADMIN_ROLE."
            />
          </div>
          {error ? (
            <p className="flex items-start gap-1.5 font-mono text-label-sm text-error">
              <Icon name="error" size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
          {txHash ? (
            <p className="flex items-center gap-1.5 font-mono text-label-sm text-on-surface-variant">
              Broadcast: <TxLink hash={txHash} />
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Small action button
 * ------------------------------------------------------------------ */

function Action({
  icon,
  label,
  onClick,
  disabled,
  pending,
  hint,
  tone = 'default',
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled: boolean;
  pending: boolean;
  hint: string;
  tone?: 'default' | 'ok' | 'danger';
}) {
  const styles =
    tone === 'ok'
      ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
      : tone === 'danger'
        ? 'border-error/50 bg-error/10 text-error hover:bg-error/20'
        : 'border-outline-variant/60 bg-surface-container-lowest text-on-surface hover:border-primary hover:text-primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={`inline-flex items-center gap-1.5 rounded border px-space-sm py-1.5 font-mono text-label-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:border-dashed disabled:border-outline-variant/50 disabled:bg-transparent disabled:text-outline ${styles}`}
    >
      <Icon name={pending ? 'autorenew' : icon} size={13} className={pending ? 'animate-spin' : ''} />
      {label}
    </button>
  );
}
