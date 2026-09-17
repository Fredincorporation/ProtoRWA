import type { Metadata } from 'next';
import Link from 'next/link';

import { FeaturedBatches } from '@/components/marketing/featured-batches';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { ProblemMatrix } from '@/components/marketing/problem-matrix';
import { Icon } from '@/components/ui/icon';
import { mockProjects, openReviewCount, totalLocked } from '@/lib/data/mock';
import { formatEthNumber, formatNumber } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Physical Product RWAs, Milestone-Backed',
  description:
    'Tokenize physical hardware into milestone-gated claims. Founders fund production without equity dilution; backers get escrowed capital and a secondary market.',
};

/** Protocol stat strip. Values are computed from the data layer, not hardcoded. */
function StatStrip() {
  const locked = totalLocked();
  const reviews = openReviewCount();

  const stats = [
    { label: 'Escrowed', value: `${formatEthNumber(locked, 2)} ETH` },
    { label: 'Projects', value: formatNumber(mockProjects.length) },
    { label: 'Open reviews', value: formatNumber(reviews) },
    { label: 'Settlement', value: 'Vote-gated' },
  ];

  return (
    <section className="w-full border-y border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-md lg:px-margin">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-space-md md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
              {stat.label}
            </div>
            <div className="font-display text-headline-md tabular text-on-surface">{stat.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Supported industries grid. */
function Industries() {
  const industries = [
    { icon: 'memory', label: 'Compute' },
    { icon: 'bolt', label: 'Energy' },
    { icon: 'precision_manufacturing', label: 'Robotics' },
    { icon: 'sensors', label: 'Sensors' },
    { icon: 'directions_car', label: 'Mobility' },
    { icon: 'biotech', label: 'Biotech' },
    { icon: 'factory', label: 'Manufacturing' },
    { icon: 'category', label: 'Other' },
  ];

  return (
    <section className="w-full bg-surface-container-lowest px-space-lg py-space-xl lg:px-margin">
      <div className="mx-auto max-w-7xl space-y-space-lg">
        <div className="max-w-xl">
          <div className="mb-1 font-mono text-label-md uppercase tracking-widest text-primary">
            {'//'} Asset Classes
          </div>
          <h2 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
            Supported Industries
          </h2>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Any build with a bill of materials, a production schedule and a
            verifiable output can be underwritten.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-space-sm sm:grid-cols-4 lg:grid-cols-8">
          {industries.map((industry) => (
            <div
              key={industry.label}
              className="flex flex-col items-center gap-2 rounded-lg bg-surface-container p-space-sm text-center transition-colors hover:bg-surface-container-high"
            >
              <Icon name={industry.icon} size={24} className="text-primary" />
              <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
                {industry.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Closing CTA. */
function ClosingCta() {
  return (
    <section className="relative w-full overflow-hidden bg-surface px-space-lg py-space-xl lg:px-margin">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-brand-glow" />
      <div className="relative z-10 mx-auto max-w-3xl space-y-space-md text-center">
        <h2 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
          Manufacture Without Capital Dilution
        </h2>
        <p className="text-body-lg text-on-surface-variant">
          Register a hardware build, define your milestone schedule, and raise
          against production output, not equity. Capital releases only when claim
          holders approve the evidence.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-space-sm pt-space-xs">
          <Link
            href="/studio/new"
            className="inline-flex items-center gap-2 rounded bg-primary px-space-md py-3 font-display text-headline-sm text-on-primary transition-colors hover:bg-primary-fixed"
          >
            <Icon name="add" size={20} />
            Start a Project
          </Link>
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 rounded bg-surface-container px-space-md py-3 font-mono text-label-lg text-on-surface transition-colors hover:bg-surface-container-high"
          >
            Browse Projects
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Landing page.
 *
 * Section order mirrors the design: hero -> stats -> capital dilemma ->
 * protocol mechanics -> featured batches -> industries -> closing CTA.
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <StatStrip />
      <ProblemMatrix />
      <HowItWorks />
      <FeaturedBatches projects={mockProjects} />
      <Industries />
      <ClosingCta />
    </>
  );
}
