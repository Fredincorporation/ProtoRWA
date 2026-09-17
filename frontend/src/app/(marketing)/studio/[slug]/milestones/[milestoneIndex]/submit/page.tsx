'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { getProjectBySlug } from '@/lib/data/mock';
import { formatEthNumber } from '@/lib/format';
import { milestoneStatus } from '@/lib/status';

/**
 * Founder Milestone Evidence Submission Studio (Screen 27).
 *
 * Founders upload factory evidence (BOM receipts, QA certs, lab reports) as
 * IPFS CIDs. Submitting calls submitEvidence() on MilestoneEscrow.sol, which
 * opens a 72-hour backer vote window after the HardwareVerifier Stylus
 * contract attests the batch Merkle root.
 */
export default function MilestoneSubmitPage() {
  const params = useParams<{ slug: string; milestoneIndex: string }>();
  const project = getProjectBySlug(params.slug);
  const idx = Number(params.milestoneIndex);
  const milestone = project?.milestones[idx];

  const [evidenceCid, setEvidenceCid] = React.useState('');
  const [checklist, setChecklist] = React.useState({
    bom: false,
    qa: false,
    evtDvt: false,
    photos: false,
    inspection: false,
  });

  if (!project || !milestone) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center font-mono text-outline">
        Project or milestone not found.
      </div>
    );
  }

  const status = milestoneStatus(milestone.status);
  const allChecked = Object.values(checklist).every(Boolean);
  const canSubmit = evidenceCid.length > 10 && allChecked;

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <nav
            aria-label="Breadcrumb"
            className="mb-space-sm flex flex-wrap items-center gap-1.5 font-mono text-label-sm text-outline"
          >
            <Link href="/studio" className="transition-colors hover:text-primary">
              Studio
            </Link>
            <Icon name="chevron_right" size={14} />
            <span className="text-on-surface">{project.title}</span>
            <Icon name="chevron_right" size={14} />
            <span className="text-on-surface">Milestone {idx + 1} Evidence</span>
          </nav>
          <h1 className="font-display text-headline-md text-on-surface">
            Submit Milestone Evidence
          </h1>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Upload cryptographic evidence of production progress to open the backer vote window.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-space-lg py-space-xl lg:px-margin">
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
                  <span className="text-primary">{formatEthNumber(milestone.trancheAmount, 2)} ETH</span>
                </div>
                <div className="border-t border-outline-variant/20 pt-space-sm">
                  <div className="text-outline">Release conditions</div>
                  <ul className="mt-1 space-y-0.5 text-on-surface-variant">
                    <li>Quorum ≥ {milestone.quorumBps / 100}% of eligible weight</li>
                    <li>Approve ≥ {milestone.approvalThresholdBps / 100}% of eligible weight</li>
                    <li>Vote window: 72 hours</li>
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
{`Founder submits CID
        ↓
submitEvidence()
on MilestoneEscrow.sol
        ↓
HardwareVerifier
.verifyHardwareBatch()
[Stylus WASM]
        ↓
Vote window opens (72h)
        ↓
Quorum + threshold met
        ↓
Tranche → Founder`}
              </pre>
            </div>
          </aside>

          {/* ── RIGHT: Evidence form ──────────────────────────────── */}
          <div className="flex flex-col gap-space-lg">
            {/* IPFS CID input */}
            <section className="rounded-lg border border-outline-variant/40 bg-surface-container">
              <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
                <h2 className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                  Evidence Package
                </h2>
              </div>
              <div className="p-space-md">
                <label className="block">
                  <span className="font-mono text-label-sm text-on-surface-variant">
                    IPFS Evidence CID
                  </span>
                  <input
                    type="text"
                    value={evidenceCid}
                    onChange={(e) => setEvidenceCid(e.target.value)}
                    placeholder="Qm... or bafy..."
                    className="mt-space-xs w-full rounded border border-outline-variant/40 bg-surface-container-lowest px-space-sm py-2 font-mono text-label-md text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
                  />
                  <span className="mt-1 block font-mono text-label-sm text-outline">
                    Paste the IPFS CID of your evidence package (zipped directory or car file)
                  </span>
                </label>
              </div>
            </section>

            {/* Checklist */}
            <section className="rounded-lg border border-outline-variant/40 bg-surface-container">
              <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
                <h2 className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                  Evidence Checklist
                </h2>
              </div>
              <ul className="flex flex-col divide-y divide-outline-variant/20 p-space-md">
                {(
                  [
                    ['bom', 'Bill of Materials (BOM) receipt', 'description'],
                    ['qa', 'Factory QA certification PDF', 'verified_user'],
                    ['evtDvt', 'EVT / DVT test results', 'science'],
                    ['photos', 'Production photos / video', 'photo_camera'],
                    ['inspection', 'Third-party inspection report', 'fact_check'],
                  ] as const
                ).map(([key, label, icon]) => (
                  <li key={key} className="flex items-center gap-space-sm py-space-sm">
                    <button
                      type="button"
                      onClick={() =>
                        setChecklist((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                      className={[
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                        checklist[key as keyof typeof checklist]
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-outline-variant/60 bg-surface-container-lowest text-transparent',
                      ].join(' ')}
                      aria-checked={checklist[key as keyof typeof checklist]}
                      role="checkbox"
                    >
                      <Icon name="check" size={12} />
                    </button>
                    <Icon name={icon} size={16} className="shrink-0 text-secondary" />
                    <span className="text-body-sm text-on-surface">{label}</span>
                  </li>
                ))}
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
                Your evidence CID will be submitted to the{' '}
                <strong className="text-on-surface">HardwareVerifier</strong> Stylus contract on
                Arbitrum Sepolia. The contract runs Rust WASM to verify your batch Merkle proof and
                emits a{' '}
                <code className="rounded bg-surface-container-highest px-1 font-mono text-label-sm text-primary">
                  HardwareBatchVerified
                </code>{' '}
                event, after which the vote window opens.
              </p>
              <div className="mt-space-sm flex items-center gap-space-xs rounded bg-surface-container-highest px-space-sm py-1.5 font-mono text-label-sm">
                <Icon name="verified" size={14} className="shrink-0 text-primary" />
                <span className="text-on-surface-variant">
                  Stylus Verifier:{' '}
                  <a
                    href="https://sepolia.arbiscan.io/address/0x510f4d65e9f7778b09ad52a4ec19c590a934f913"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    0x510f4d65e9f7778b09ad52a4ec19c590a934f913
                  </a>
                </span>
              </div>
            </section>

            {/* Submit */}
            <Button
              variant="primary"
              disabled={!canSubmit}
              className="w-full justify-center"
              title={!canSubmit ? 'Complete checklist and enter an IPFS CID first' : undefined}
            >
              <Icon name="upload" size={18} />
              Submit Evidence & Open Vote Window
            </Button>
            {!canSubmit && (
              <p className="text-center font-mono text-label-sm text-outline">
                Complete all checklist items and enter your IPFS CID to submit.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

