import Link from 'next/link';

import { Icon } from '@/components/ui/icon';

/**
 * Landing hero.
 *
 * Layout, spacing, typography and accent treatment are ported faithfully from the
 * Stitch design: full-bleed lowest surface, dotted radial grid overlay at 20%
 * opacity, two blurred colour washes, a terminal-style diagnostic tag, a 7/5
 * column split, and the hardware showcase card on the right.
 *
 * COPY REVIEW REQUIRED
 * --------------------
 * The source design's hero copy makes claims this deployment cannot support, so
 * they are NOT reproduced here. Specifically the original read:
 *   - "2.8x ARR"                         -> a projected financial return.
 *   - "Zero Slippage Instant Liquidity"  -> a liquidity guarantee.
 *   - "SGS & Intertek ISO Oracles"       -> third-party certification we do not have.
 *   - "Automated USDC Distribution"      -> describes a mechanism we have not built.
 *   - "Factory: Foxconn Shenzhen Line 4" -> a named manufacturer relationship.
 *   - A hardcoded block number           -> implies a live indexer we do not run.
 * Everything below is either verifiable, marked as illustrative, or marked TODO.
 * Re-add claims only once they are true and provable.
 */

/** Illustrative figures for the showcase card. Clearly labelled in the UI. */
const showcase = {
  batch: 'Batch #HF-204',
  name: 'HelioFrost Pro',
  tagline: 'Off-Grid Solar Vaccine Cold-Chain Unit',
  sku: 'SKU: HFR-VAC-90',
  status: 'ESCROW DEMO',
  target: 500_000,
  raised: 410_000,
  backers: 318,
  telemetry: '3.8°C STABLE',
  factory: 'Demonstration data', // TODO: replace with a real, verified facility.
  milestones: [
    { label: 'BOM Sourced', state: 'done' as const },
    { label: 'Tooling Complete', state: 'done' as const },
    { label: 'Pilot Batch', state: 'active' as const },
  ],
};

const fundedPct = Math.round((showcase.raised / showcase.target) * 100);

function DiagnosticTag() {
  return (
    <div className="mb-space-md flex-wrap items-center gap-space-sm">
      <span className="inline-flex items-center gap-1.5 rounded bg-surface-container-high px-2.5 py-1 font-mono text-label-sm uppercase tracking-widest text-primary shadow-inner">
        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary" />
        {/* Illustrative, not a live chain read. TODO: wire to a real indexer. */}
        Demonstration Environment • No Live Funds
      </span>
      <span className="hidden font-mono text-label-sm uppercase tracking-wider text-on-surface-variant sm:inline-block">
        Milestone Escrow Protocol
      </span>
    </div>
  );
}

function ShowcaseCard() {
  return (
    <div className="group relative overflow-hidden rounded-lg bg-surface-container p-space-md shadow-2xl">
      {/* Structural schematic watermark. */}
      <div className="pointer-events-none absolute right-0 top-0 p-3 opacity-15">
        <svg
          width="120"
          height="120"
          viewBox="0 0 100 100"
          fill="none"
          className="text-primary"
          aria-hidden
        >
          <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
          <line x1="5" y1="50" x2="95" y2="50" stroke="currentColor" strokeWidth="1" />
          <line x1="50" y1="5" x2="50" y2="95" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>

      <div className="mb-space-sm flex items-start justify-between gap-space-sm">
        <div>
          <span className="rounded bg-surface-container-lowest px-2 py-0.5 font-mono text-label-sm uppercase tracking-widest text-secondary">
            {showcase.batch}
          </span>
          <h3 className="mt-1 font-display text-headline-sm text-on-surface">{showcase.name}</h3>
          <p className="text-body-sm text-on-surface-variant">{showcase.tagline}</p>
        </div>
        <div className="flex flex-col items-end">
          <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 font-mono text-label-sm font-semibold text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {showcase.status}
          </span>
          <span className="mt-1 font-mono text-label-sm text-outline">{showcase.sku}</span>
        </div>
      </div>

      {/* Product photograph from the Stitch design screens. */}
      <div className="relative mb-space-sm h-52 w-full overflow-hidden rounded bg-surface-container-lowest">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuBt3oGRLiP8fH_I-GBaWkIy2EqJEQNgSzv4Li_JVQG8UHoEE1qpF6bnBkviwjSf_-HfFqIRAg-dP8Op2Bk3FYagfA90Gsap2C_3WJW1EV5fGy1YXDDJNA9JOyx5HPyjW2EpZQwDVdMewgWZKMObd9njfqj17oioJbeFc_l11nNC62PFr-6xaiuP2Rwej-UH97Znq1FepkQk7tSIhIIohuPLbFhspKAr0MGND2u8OIAXTpqDB7PPRThS"
          alt="HelioFrost Pro — solar vaccine cold-chain unit"
          className="h-full w-full object-cover"
        />
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded bg-surface/90 px-3 py-1.5 font-mono text-label-sm backdrop-blur-md">
          <span className="flex items-center gap-1 text-primary">
            <Icon name="sensors" size={14} />
            Telemetry: {showcase.telemetry}
          </span>
          <span className="text-on-surface-variant">{showcase.factory}</span>
        </div>
      </div>

      {/* Metric grid. "Target Yield" is deliberately omitted - it was a return
          projection in the source design. */}
      <div className="mb-space-sm grid grid-cols-3 gap-2 rounded bg-surface-container-lowest p-2 text-center font-mono">
        <div>
          <div className="font-mono text-label-sm text-on-surface-variant">Escrow Model</div>
          <div className="font-display text-headline-sm font-semibold text-primary">
            Milestone
          </div>
        </div>
        <div>
          <div className="font-mono text-label-sm text-on-surface-variant">Funded Rate</div>
          <div className="font-display text-headline-sm font-semibold tabular text-on-surface">
            {fundedPct}%
          </div>
        </div>
        <div>
          <div className="font-mono text-label-sm text-on-surface-variant">Backers</div>
          <div className="font-display text-headline-sm font-semibold tabular text-secondary">
            {showcase.backers}
          </div>
        </div>
      </div>

      {/* Escrow progress. */}
      <div className="mb-space-sm space-y-1">
        <div className="flex justify-between font-mono text-label-sm text-on-surface-variant">
          <span>
            Raised: {showcase.raised.toLocaleString('en-US')} USDC
          </span>
          <span>Target: {showcase.target.toLocaleString('en-US')} USDC</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded bg-surface-container-lowest"
          role="progressbar"
          aria-valuenow={fundedPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Escrow funding progress"
        >
          <div
            className="h-full rounded bg-gradient-to-r from-primary to-secondary"
            style={{ width: `${fundedPct}%` }}
          />
        </div>
      </div>

      {/* Milestone mini-tracker. */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 font-mono text-label-sm text-on-surface">
        {showcase.milestones.map((milestone) => (
          <span
            key={milestone.label}
            className={
              milestone.state === 'active'
                ? 'flex items-center gap-1 text-tertiary'
                : 'flex items-center gap-1 text-primary'
            }
          >
            <Icon
              name={milestone.state === 'active' ? 'pending' : 'check_circle'}
              size={16}
              filled={milestone.state === 'done'}
            />
            {milestone.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative w-full overflow-hidden bg-surface-container-lowest px-space-lg pb-space-xl pt-space-xl lg:px-margin">
      {/* Ambient structural grid. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-20 bg-[radial-gradient(#4edea3_1px,transparent_1px)] [background-size:24px_24px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/10 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/2 h-80 w-80 rounded-full bg-secondary/10 blur-[100px]"
      />

      <div className="relative z-10 mx-auto max-w-7xl">
        <DiagnosticTag />

        <div className="grid grid-cols-1 items-center gap-space-xl lg:grid-cols-12">
          <div className="flex flex-col space-y-space-md lg:col-span-7">
            {/**
             * The source design put a hard <br/> and an inline underlined span
             * mid-sentence, which wraps badly at 1440px and drags the underline
             * through the following line. Restructured as two clean blocks: the
             * product statement, then the accent clause on its own line.
             */}
            <h1 className="font-display text-headline-lg font-bold uppercase leading-tight tracking-tight text-on-surface lg:text-[44px] lg:leading-[52px]">
              <span className="block">Physical Product RWAs.</span>
              <span className="mt-1 block text-primary">From Prototype to Milestone-Backed Claims.</span>
            </h1>

            <p className="max-w-2xl text-body-lg leading-relaxed text-on-surface-variant">
              Tokenize physical hardware and manufactured goods into
              milestone-gated claims. Founders fund production without equity
              dilution; backers get verifiable factory milestone escrow and
              secondary liquidity. Capital releases only against evidence
              approved by claim holders.
            </p>

            <div className="flex flex-wrap items-center gap-space-sm pt-space-xs">
              <Link
                href="/explore"
                data-path="explore-projects"
                className="inline-flex items-center gap-2 rounded bg-primary px-space-md py-3 font-display text-headline-sm text-on-primary shadow-[0_0_24px_-4px_rgba(78,222,163,0.35)] transition-colors hover:bg-primary-fixed"
              >
                <span>Explore Hardware RWAs</span>
                <Icon name="arrow_forward" size={20} />
              </Link>

              <Link
                href="/studio"
                data-path="founder-studio"
                className="inline-flex items-center gap-2 rounded bg-surface-container px-space-md py-3 font-mono text-label-lg text-on-surface transition-colors hover:bg-surface-container-high"
              >
                <Icon name="precision_manufacturing" size={20} className="text-secondary" />
                <span>Launch a Product (Founder Studio)</span>
              </Link>

              <Link
                href="/how-it-works"
                data-path="how-it-works"
                className="inline-flex items-center gap-1.5 rounded px-space-sm py-2 font-mono text-label-md text-on-surface-variant transition-colors hover:text-primary"
              >
                <Icon name="account_tree" size={18} />
                <span>See how the protocol works</span>
              </Link>
            </div>

            {/* Micro metadata. Rewritten from unverifiable claims to protocol facts. */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-space-sm font-mono text-label-sm text-outline">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                Voting-gated tranche release
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-tertiary" />
                Snapshot-based vote weight
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Claims tradeable on a secondary market
              </span>
            </div>
          </div>

          <div className="relative lg:col-span-5">
            <ShowcaseCard />
          </div>
        </div>
      </div>
    </section>
  );
}
