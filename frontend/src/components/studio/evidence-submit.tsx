'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { zeroAddress } from 'viem';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { formatUsdgNumber } from '@/lib/format';
import { uploadFile } from '@/lib/ipfs';
import { milestoneStatus } from '@/lib/status';
import { protocolChain } from '@/lib/wagmi';
import {
  ACCEPT_ATTRIBUTE,
  describeIntakeLimits,
  formatBytes,
  intakeFiles,
  shortenDigest,
  totalBytes,
  type EvidenceFile,
  type RejectedFile,
} from '@/lib/studio/evidence';
import { buildBatchProof } from '@/lib/studio/merkle';
import {
  defaultChain,
  getContracts,
  isDeployed,
  milestoneEscrowAbi,
  protocolAddressUrl,
  protocolTxUrl,
  type Milestone,
  type Project,
} from '@protorwa/shared';
import { cn } from '@/lib/utils';

/**
 * Founder Milestone Evidence Submission Studio (Screen 27).
 *
 * The founder attaches factory artefacts (BOM receipts, QA certs, lab reports),
 * every file is pinned to IPFS through `/api/upload`, and the resulting manifest
 * CID is written to the chain with `submitEvidence()` on MilestoneEscrow.sol,
 * which snapshots eligible claim weight and opens the backer vote window.
 *
 * This is the interactive half of the screen; the surrounding page resolves the
 * project through the catalogue and decides whether the escrow is live. When the
 * milestone belongs to a showcase (no on-chain escrow) the form stays fully
 * usable but its submit is labelled as a simulation, so nothing is presented as a
 * real broadcast when it is not.
 */
export function MilestoneEvidenceSubmit({
  project,
  milestone,
  milestoneIndex,
}: {
  project: Project;
  milestone: Milestone;
  milestoneIndex: number;
}) {
  const idx = milestoneIndex;

  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: protocolChain.id });

  /**
   * Attached artefacts, held as real `File` objects with a computed digest.
   */
  const [evidence, setEvidence] = React.useState<EvidenceFile[]>([]);
  const [rejections, setRejections] = React.useState<RejectedFile[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isReading, setIsReading] = React.useState(false);

  /** Manual checklist overrides, for categories a file extension cannot reveal. */
  const [manualChecks, setManualChecks] = React.useState<Record<string, boolean>>({});

  /** Upload / broadcast state surfaced to the founder. */
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [txHash, setTxHash] = React.useState<`0x${string}` | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  /**
   * Processes a selection or drop.
   *
   * `intakeFiles` validates size, type, count and duplicates, and computes a
   * SHA-256 per file - so this is async, and the UI must show that it is working
   * rather than appearing to swallow the drop.
   */
  const handleFiles = React.useCallback(
    async (incoming: FileList | File[]) => {
      const list = Array.from(incoming);
      if (list.length === 0) return;

      setIsReading(true);
      try {
        const result = await intakeFiles(list, evidence);
        setEvidence((current) => [...current, ...result.accepted]);
        setRejections(result.rejected);
      } finally {
        setIsReading(false);
      }
    },
    [evidence],
  );

  const onDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (event.dataTransfer?.files?.length) void handleFiles(event.dataTransfer.files);
    },
    [handleFiles],
  );

  const removeFile = (id: string) => {
    setEvidence((current) => current.filter((file) => file.id !== id));
    setRejections([]);
  };

  const status = milestoneStatus(milestone.status);

  /**
   * Checklist state.
   *
   * Items with an attached artefact in the matching category tick themselves; a
   * founder can also tick one manually, because a third-party inspection report
   * is a PDF like any other and no extension reveals it.
   */
  const checklistItems = [
    ['bom', 'Bill of Materials (BOM) receipt', 'description'],
    ['qa', 'Factory QA certification', 'verified_user'],
    ['evtDvt', 'EVT / DVT test results', 'science'],
    ['photos', 'Production photos / video', 'photo_camera'],
    ['inspection', 'Third-party inspection report', 'fact_check'],
  ] as const;

  const checklist = Object.fromEntries(
    checklistItems.map(([key]) => {
      const hasFile = evidence.some(
        (file) => (file.category as string) === key || (key === 'inspection' && file.category === 'qa'),
      );
      return [key, hasFile || Boolean(manualChecks[key])];
    }),
  ) as Record<string, boolean>;

  const allChecked = Object.values(checklist).every(Boolean);
  const filesReady = evidence.length > 0 && allChecked;
  const packageSize = totalBytes(evidence);

  /**
   * Whether this is a live escrow we can actually write to.
   *
   * Mirrors the source-of-truth used everywhere else: a project reads or writes
   * the chain only when `liquidityMode === 'real'`, carries an on-chain id, and
   * the escrow is deployed. A showcase never hits the chain.
   */
  const escrow = getContracts(protocolChain.id).milestoneEscrow;
  const onChainId = project.onChainProjectId;
  const isReal =
    project.liquidityMode === 'real' && Boolean(onChainId) && Boolean(escrow) && isDeployed(protocolChain.id);

  // Access rules the contract enforces, surfaced before the founder wastes a tx.
  const isFounder = Boolean(address) && address?.toLowerCase() === project.founder.toLowerCase();
  const onProtocolChain = chainId === protocolChain.id;
  const inProduction = project.status === 'IN_PRODUCTION';
  const milestoneOpenToSubmit = milestone.status === 'PENDING' || milestone.status === 'REJECTED';
  const canBroadcast = Boolean(isReal && escrow && isConnected && isFounder && onProtocolChain && publicClient);

  const busy = uploading;

  /**
   * Pins every artefact, writes a manifest, then calls submitEvidence().
   *
   * The escrow stores a single `evidenceCid` string, so the files are pinned
   * individually and the manifest CID that lists them is what lands on-chain -
   * one pointer that resolves to the whole package.
   */
  const submit = async () => {
    if (busy) return;
    setError(null);
    setTxHash(null);

    if (!filesReady) {
      setError('Attach at least one artefact and complete the checklist first.');
      return;
    }

    // Showcase path: exercise the full UI but be honest that nothing broadcasts.
    if (!isReal) {
      setProgress('Simulated - this showcase has no on-chain escrow.');
      return;
    }

    if (!canBroadcast) {
      if (!isConnected) setError('Connect your wallet to submit evidence.');
      else if (!isFounder) setError('Only the project founder can submit milestone evidence.');
      else if (!inProduction) setError('Evidence can only be submitted while the project is in production.');
      else if (!onProtocolChain) {
        try {
          await switchChainAsync({ chainId: protocolChain.id });
        } catch {
          setError(`Switch to ${protocolChain.name} in your wallet to submit.`);
        }
      } else {
        setError('No escrow is deployed on this network, so submission is unavailable.');
      }
      return;
    }

    try {
      if (!escrow || !publicClient || !onChainId) {
        setError('No escrow is deployed on this network, so submission is unavailable.');
        return;
      }
      setUploading(true);
      const items: Array<{ name: string; cid: string; digest: string; size: number; type: string }> = [];
      for (let i = 0; i < evidence.length; i++) {
        const file = evidence[i]!;
        setProgress(`Pinning ${file.name} (${i + 1}/${evidence.length})…`);
        const { cid } = await uploadFile(file.file);
        items.push({ name: file.name, cid, digest: file.digest, size: file.size, type: file.type });
      }

      setProgress('Pinning evidence manifest…');
      const manifestBlob = new Blob(
        [
          JSON.stringify(
            {
              projectId: onChainId,
              milestoneIndex: idx,
              submittedAt: new Date().toISOString(),
              artefacts: items,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      );
      const manifestFile = new File([manifestBlob], 'evidence-manifest.json', { type: 'application/json' });
      const { cid: manifestCid } = await uploadFile(manifestFile);

      /*
       * Hardware attestation.
       *
       * When the escrow has a Stylus verifier wired, the artefact digests form a
       * batch whose root is committed on-chain, and `submitEvidence` carries a
       * Merkle opening for one artefact. The escrow then calls
       * `verifyHardwareBatch`, so the review only opens if the submitted package
       * matches the committed root. With no verifier the leaf/proof args are empty
       * and the milestone behaves exactly as a non-hardware deployment.
       */
      const id = BigInt(onChainId!);
      const verifierAddr = (await publicClient!.readContract({
        address: escrow,
        abi: milestoneEscrowAbi,
        functionName: 'verifier',
      })) as `0x${string}`;
      const attestationOn = verifierAddr.toLowerCase() !== zeroAddress.toLowerCase();

      let leaf: `0x${string}` = zeroAddress;
      let proof: `0x${string}`[] = [];
      if (attestationOn) {
        const { root, leaf: openLeaf, proof: openProof } = buildBatchProof(items.map((item) => item.digest));
        leaf = openLeaf;
        proof = openProof;

        const existingRoot = (await publicClient!.readContract({
          address: escrow,
          abi: milestoneEscrowAbi,
          functionName: 'committedRoots',
          args: [id, BigInt(idx)],
        })) as `0x${string}`;

        if (existingRoot === zeroAddress) {
          setProgress('Committing the telemetry root on-chain…');
          const commitHash = await writeContractAsync({
            address: escrow,
            abi: milestoneEscrowAbi,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            functionName: 'setCommitment' as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            args: [id, BigInt(idx), root] as any,
            chainId: protocolChain.id,
          });
          const commitReceipt = await publicClient!.waitForTransactionReceipt({ hash: commitHash });
          if (commitReceipt.status !== 'success') {
            throw new Error('setCommitment reverted on-chain. No attestation root was recorded.');
          }
        }
      }

      setProgress('Confirm submitEvidence in your wallet…');
      const hash = await writeContractAsync({
        address: escrow,
        abi: milestoneEscrowAbi,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        functionName: 'submitEvidence' as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: [id, BigInt(idx), manifestCid, leaf, proof] as any,
        chainId: protocolChain.id,
      });
      setTxHash(hash);
      setProgress('Waiting for the transaction to mine…');
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        throw new Error('submitEvidence reverted on-chain. The escrow kept the prior state.');
      }
      setProgress(
        attestationOn
          ? 'Evidence submitted and attested - the vote window is now open.'
          : 'Evidence submitted - the vote window is now open.',
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
      setProgress(null);
    } finally {
      setUploading(false);
    }
  };

  /**
   * Verifier address from the env-driven registry.
   *
   * Read from `getContracts` rather than a literal so a redeploy does not leave
   * the link pointing at the previous deployment.
   */
  const stylusVerifier = getContracts(defaultChain.id).hardwareVerifier;

  return (
    <div className="grid gap-space-xl lg:grid-cols-[320px_1fr]">
      {/* ── LEFT: Milestone context ───────────────────────────── */}
      <aside className="flex flex-col gap-space-lg">
        <div className="rounded-lg border border-outline-variant/40 bg-surface-container">
          <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
            <h2 className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
              Milestone Context
            </h2>
          </div>
          <div className="flex flex-col gap-space-sm p-space-md font-mono text-label-sm">
            <div>
              <div className="text-outline">Milestone {idx + 1}</div>
              <div className="text-body-sm font-medium text-on-surface">{milestone.title}</div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-outline">Status</span>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-outline">Tranche</span>
              <span className="text-primary">{formatUsdgNumber(milestone.trancheAmount, 2)} USDG</span>
            </div>
            <div className="border-t border-outline-variant/20 pt-space-sm">
              <div className="text-outline">Release conditions</div>
              <ul className="mt-1 space-y-0.5 text-on-surface-variant">
                <li>Quorum ≥ {milestone.quorumBps / 100}% of eligible weight</li>
                <li>Approve ≥ {milestone.approvalThresholdBps / 100}% of eligible weight</li>
                <li>Vote window: {Math.round(milestone.votingPeriodSeconds / 3600) || 72} hours</li>
              </ul>
            </div>
          </div>
        </div>

        {/* On-chain flow */}
        <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-space-md">
          <div className="mb-space-sm font-mono text-label-sm uppercase tracking-wider text-outline">
            On-chain Flow
          </div>
          <pre className="whitespace-pre-wrap font-mono text-label-sm leading-relaxed text-on-surface-variant">
{`Founder commits telemetry root
        ↓  setCommitment()
Founder submits evidence CID + Merkle proof
        ↓
submitEvidence() on MilestoneEscrow.sol
  → verifier.verifyHardwareBatch()  [Stylus WASM]
  (review opens only if the proof matches the root)
  (snapshots eligible weight)
        ↓
Vote window opens
        ↓
HardwareVerifier.evaluateConsensus() predicts
        ↓
settleReview() → release / withhold`}
          </pre>
          <p className="mt-2 font-mono text-label-sm text-outline">
            When this deployment has a Stylus verifier wired, the escrow calls{' '}
            verifyHardwareBatch() before opening the review, so the vote can only start once the
            submitted package matches the root the founder committed beforehand.{' '}
            evaluateConsensus() forecasts the outcome; the escrow stays the settlement authority.
          </p>
        </div>
      </aside>

      {/* ── RIGHT: Evidence form ──────────────────────────────── */}
      <div className="flex flex-col gap-space-lg">
        {/* Evidence package: a real file upload, not a CID paste box. */}
        <section className="rounded-lg border border-outline-variant/40 bg-surface-container">
          <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
            <h2 className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
              Evidence Package
            </h2>
          </div>
          <div className="p-space-md">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex flex-col items-center justify-center gap-space-sm rounded-lg border-dashed p-space-lg text-center transition-colors',
                isDragging
                  ? 'border-primary bg-primary/10'
                  : 'border-outline-variant/60 bg-surface-container-lowest',
              )}
            >
              <span
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full',
                  isReading ? 'bg-primary/10 text-primary' : 'bg-surface-container text-outline',
                )}
              >
                <Icon
                  name={isReading ? 'autorenew' : 'cloud_upload'}
                  size={22}
                  className={isReading ? 'animate-spin' : undefined}
                />
              </span>

              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-label-md text-on-surface">
                  {isReading
                    ? 'Reading files and computing digests…'
                    : isDragging
                      ? 'Drop to attach'
                      : 'Drag evidence here, or choose files'}
                </span>
                <span className="max-w-prose font-mono text-label-sm text-outline">
                  {describeIntakeLimits()}
                </span>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isReading}
                className="inline-flex items-center gap-1.5 rounded border-primary/40 bg-primary/10 px-space-sm py-1.5 font-mono text-label-sm text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
              >
                <Icon name="folder_open" size={14} />
                Choose files
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT_ATTRIBUTE}
                className="sr-only"
                onChange={(event) => {
                  if (event.target.files) void handleFiles(event.target.files);
                  event.target.value = '';
                }}
              />
            </div>

            {rejections.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded border-error/40 bg-error/5 p-space-sm">
                {rejections.map((rejection) => (
                  <li
                    key={rejection.name}
                    className="flex items-start gap-1.5 font-mono text-label-sm text-error"
                  >
                    <Icon name="error" size={13} className="mt-0.5 shrink-0" />
                    <span>
                      <strong className="font-semibold">{rejection.name}</strong> —{' '}
                      {rejection.reason}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {evidence.length > 0 ? (
              <ul className="flex flex-col divide-y divide-outline-variant/20 rounded border-outline-variant/40 bg-surface-container-lowest">
                {evidence.map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-wrap items-center justify-between gap-space-sm p-space-sm"
                  >
                    <div className="flex min-w-0 items-center gap-space-sm">
                      <Icon name="description" size={16} className="shrink-0 text-secondary" />
                      <div className="min-w-0">
                        <div className="truncate font-mono text-label-md text-on-surface">
                          {file.name}
                        </div>
                        <div className="font-mono text-label-sm text-outline">
                          {formatBytes(file.size)} · {file.extension} · sha256{' '}
                          {shortenDigest(file.digest)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-space-sm">
                      <span className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-label-sm uppercase text-on-surface-variant">
                        {file.category === 'unclassified' ? 'unsorted' : file.category}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(file.id)}
                        aria-label={`Remove ${file.name}`}
                        className="rounded p-1 text-outline transition-colors hover:bg-surface-container hover:text-error"
                      >
                        <Icon name="delete" size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="flex items-start gap-1.5 font-mono text-label-sm text-outline">
              <Icon name="info" size={12} className="mt-0.5 shrink-0" />
              <span>
                Digests are computed locally over the file bytes. On submit, every artefact is
                pinned to IPFS and a manifest CID referencing them is written to the escrow.
              </span>
            </p>
          </div>
        </section>

        {/* Checklist, tied to the artefacts actually attached. */}
        <section className="rounded-lg border-outline-variant/40 bg-surface-container">
          <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
            <h2 className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
              Evidence Checklist
            </h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Items with a matching file attached are ticked automatically. Tick the rest manually
              where you have the document but its type cannot be inferred.
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-outline-variant/20 p-space-md">
            {checklistItems.map(([key, label, icon]) => {
              const checked = checklist[key];
              const autoTicked = evidence.some(
                (file) =>
                  (file.category as string) === key ||
                  (key === 'inspection' && file.category === 'qa'),
              );

              return (
                <li key={key} className="flex items-center gap-space-sm py-space-sm">
                  <button
                    type="button"
                    onClick={() => setManualChecks((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className={[
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                      checked
                        ? 'border-primary bg-primary text-on-primary'
                        : 'border-outline-variant/60 bg-surface-container-lowest text-transparent',
                    ].join(' ')}
                    aria-checked={checked}
                    role="checkbox"
                  >
                    <Icon name="check" size={12} />
                  </button>
                  <Icon name={icon} size={16} className="shrink-0 text-secondary" />
                  <span className="text-body-sm text-on-surface">{label}</span>
                  {autoTicked ? (
                    <span className="ml-auto font-mono text-label-sm text-primary">from upload</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Stylus verification info */}
        <section className="rounded-lg border border-secondary/30 bg-surface-container-low p-space-md">
          <div className="mb-space-sm flex items-center gap-space-sm">
            <Icon name="settings_ethernet" size={16} className="text-secondary" />
            <span className="font-mono text-label-sm uppercase tracking-wider text-secondary">
              Stylus Merkle Verification
            </span>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            The digests of your evidence artefacts are combined into a Merkle root that is committed
            on-chain, and one artefact&rsquo;s branch is submitted as the proof. The escrow calls the{' '}
            <strong className="text-on-surface">HardwareVerifier</strong> Stylus contract on{' '}
            {defaultChain.name}, which runs Rust WASM to recompute the root from your proof and
            reject the submission unless it matches the committed root — after which the vote window
            opens. It attests that the submitted package is the one that was committed; it does not
            certify that the hardware is sound.
          </p>
          <div className="mt-space-sm flex items-center gap-space-xs rounded bg-surface-container-highest px-space-sm py-1.5 font-mono text-label-sm">
            <Icon name="verified" size={14} className="shrink-0 text-primary" />
            <span className="text-on-surface-variant">
              Stylus Verifier:{' '}
              {stylusVerifier ? (
                <a
                  href={protocolAddressUrl(stylusVerifier) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {stylusVerifier}
                </a>
              ) : (
                <span className="text-outline">not configured on this deployment</span>
              )}
            </span>
          </div>
        </section>

        {/* Not-live / not-eligible notice, surfaced once instead of silently disabling. */}
        {!isReal ? (
          <p className="flex items-start gap-1.5 rounded border border-outline-variant/40 bg-surface-container-low p-space-sm font-mono text-label-sm text-outline">
            <Icon name="science" size={13} className="mt-0.5 shrink-0" />
            <span>
              Showcase milestone on simulated data - this demo project has no on-chain escrow, so
              submitting here does not broadcast a transaction.
            </span>
          </p>
        ) : !milestoneOpenToSubmit ? (
          <p className="flex items-start gap-1.5 rounded border border-warn/40 bg-warn/5 p-space-sm font-mono text-label-sm text-on-surface-variant">
            <Icon name="lock" size={13} className="mt-0.5 shrink-0 text-warn" />
            <span>
              This milestone is {status.label.toLowerCase()}. Evidence can only be submitted while a
              milestone is pending or has been rejected.
            </span>
          </p>
        ) : !isConnected ? (
          <p className="flex items-start gap-1.5 font-mono text-label-sm text-outline">
            <Icon name="account_balance_wallet" size={13} className="mt-0.5 shrink-0" />
            <span>Connect the founder wallet to submit this milestone&rsquo;s evidence.</span>
          </p>
        ) : !isFounder ? (
          <p className="flex items-start gap-1.5 font-mono text-label-sm text-error">
            <Icon name="admin_panel_settings" size={13} className="mt-0.5 shrink-0" />
            <span>
              Only the project founder (
              <Link
                href={protocolAddressUrl(project.founder) ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {project.founder.slice(0, 6)}…{project.founder.slice(-4)}
              </Link>
              ) can submit evidence. Connect that wallet to enable submission.
            </span>
          </p>
        ) : !onProtocolChain ? (
          <p className="flex items-start gap-1.5 font-mono text-label-sm text-outline">
            <Icon name="swap_horiz" size={13} className="mt-0.5 shrink-0" />
            <span>Your wallet is on chain {String(chainId)}. Switch to {protocolChain.name} to submit.</span>
          </p>
        ) : null}

        {/* Submit */}
        <Button
          variant="primary"
          onClick={() => void submit()}
          disabled={busy || !filesReady || (isReal && !(isFounder && inProduction && milestoneOpenToSubmit))}
          className="w-full justify-center"
          title={
            !filesReady
              ? 'Attach at least one artefact and complete the checklist first'
              : isReal && !isFounder
                ? 'Only the project founder can submit evidence'
                : isReal && !inProduction
                  ? 'Evidence can only be submitted while the project is in production'
                  : isReal && !milestoneOpenToSubmit
                    ? 'This milestone is not awaiting evidence'
                    : undefined
          }
        >
          <Icon name={uploading ? 'autorenew' : 'upload'} size={18} className={uploading ? 'animate-spin' : undefined} />
          {isReal ? 'Submit Evidence & Open Vote Window' : 'Simulate Evidence Submission'}
        </Button>

        {progress ? (
          <p className="text-center font-mono text-label-sm text-primary">{progress}</p>
        ) : !filesReady ? (
          <p className="text-center font-mono text-label-sm text-outline">
            {evidence.length === 0
              ? 'Attach at least one evidence file to submit.'
              : 'Complete every checklist item to submit.'}
          </p>
        ) : (
          <p className="text-center font-mono text-label-sm text-outline">
            {evidence.length} artefact{evidence.length === 1 ? '' : 's'} · {formatBytes(packageSize)} ·
            ready to submit
          </p>
        )}

        {error ? (
          <p className="flex items-start gap-1.5 rounded border border-error/40 bg-error/5 p-space-sm font-mono text-label-sm text-error">
            <Icon name="error" size={13} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}

        {txHash ? (
          <p className="flex items-center gap-1.5 font-mono text-label-sm text-outline">
            <Icon name="receipt_long" size={13} className="shrink-0" />
            Tx:
            <a
              href={protocolTxUrl(txHash) ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {txHash.slice(0, 10)}…{txHash.slice(-8)}
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
