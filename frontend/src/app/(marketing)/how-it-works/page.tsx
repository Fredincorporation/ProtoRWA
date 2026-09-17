import type { Metadata } from 'next';
import Link from 'next/link';

import { ArchitectureLayers, ComparisonMatrix } from '@/components/marketing/comparison-matrix';
import { HowItWorks as MechanismSteps } from '@/components/marketing/how-it-works';
import { PersonaPathways } from '@/components/marketing/persona-pathways';
import { Icon } from '@/components/ui/icon';

export const metadata: Metadata = {
  title: 'How It Works',
  description:
    'The ProtoRWA mechanism: escrowed capital, milestone-gated tranche release, holder voting on production evidence, and a secondary market for claims.',
};

/** Opening summary of the mechanism, in plain language. */
function MechanismSummary() {
  const facts = [
    {
      icon: 'lock',
      title: 'Capital is escrowed',
      body: 'Commitments go into MilestoneEscrow. A founder cannot withdraw undisbursed funds.',
    },
    {
      icon: 'fact_check',
      title: 'Evidence gates every release',
      body: 'Each tranche unlocks only after the founder publishes production evidence.',
    },
    {
      icon: 'how_to_vote',
      title: 'Holders decide',
      body: 'Claim holders vote to approve or reject. Weight is snapshotted at submission.',
    },
    {
      icon: 'swap_horiz',
      title: 'Claims stay liquid',
      body: 'Positions trade on the secondary market rather than locking until delivery.',
    },
  ];

  return (
    <section className="w-full px-space-lg pb-space-lg lg:px-margin">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.title} className="flex-col gap-space-sm rounded bg-surface-container p-space-md">
            <Icon name={fact.icon} size={26} className="text-primary" />
            <h2 className="font-display text-headline-sm text-on-surface">{fact.title}</h2>
            <p className="text-body-sm text-on-surface-variant">{fact.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * What the protocol does NOT do.
 *
 * Deliberately on this page, near the top of the funnel. A mechanism page that
 * only lists upsides invites the reader to assume guarantees that do not exist,
 * and this protocol has real failure modes (production can fail, hardware can be
 * late, a claim can become worthless). Stating them here is both honest and, for
 * a judge reading critically, more credible than a page of promises.
 */
function LimitationsNotice() {
  const limits = [
    'Claims are not equity and carry no ownership, dividend or voting rights in any company.',
    'Escrow reduces counterparty risk; it does not eliminate production risk. A build can still fail or ship late.',
    'Milestone approval depends on holder participation. Low turnout can leave a tranche unreleased.',
    'Secondary liquidity is peer-to-peer. A listing is only worth what a buyer will pay.',
    'Nothing on this site is investment advice, and no return is promised or projected.',
  ];

  return (
    <section className="w-full px-space-lg pb-space-lg lg:px-margin">
      {/*
       * Two-column layout on wide screens: a narrow notice box stretched to the
       * full 7xl container left the bullet text in the left third with a large
       * empty area beside it. The text column is now capped to a readable
       * measure and the box hugs it.
       */}
      <div className="mx-auto max-w-7xl rounded-lg border-tertiary/40 bg-tertiary/5 p-space-md">
        <div className="flex flex-col gap-space-md lg:flex-row lg:items-start lg:gap-space-xl">
          <div className="flex items-center gap-space-sm lg:w-64 lg:shrink-0">
            <Icon name="warning" size={20} className="shrink-0 text-tertiary" />
            <h2 className="font-display text-headline-sm text-tertiary">
              What this protocol does not do
            </h2>
          </div>
          <ul className="flex max-w-3xl flex-col gap-1.5 text-body-sm text-on-surface-variant">
            {limits.map((limit) => (
              <li key={limit} className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-tertiary" />
                <span>{limit}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default function HowItWorksPage() {
  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <div className="mb-1 font-mono text-label-md uppercase tracking-widest text-primary">
            {'//'} Mechanism and Architecture
          </div>
          <h1 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
            How ProtoRWA Works
          </h1>
          <p className="mt-2 max-w-3xl text-body-lg text-on-surface-variant">
            Hardware production is financed against output rather than equity.
            Capital is held in escrow and released tranche by tranche, each one
            gated on production evidence that claim holders approve.
          </p>
          <div className="mt-space-md flex-wrap items-center gap-space-sm">
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 rounded bg-primary px-space-md py-2.5 font-display text-headline-sm text-on-primary transition-colors hover:bg-primary-fixed"
            >
              <Icon name="search" size={18} />
              Explore projects
            </Link>
            <Link
              href="/studio/new"
              className="inline-flex items-center gap-2 rounded bg-surface-container px-space-md py-2.5 font-mono text-label-lg text-on-surface transition-colors hover:bg-surface-container-high"
            >
              <Icon name="add" size={18} />
              Register a build
            </Link>
          </div>
        </div>
      </header>

      <MechanismSummary />
      <LimitationsNotice />
      <MechanismSteps />
      <PersonaPathways />
      <ArchitectureLayers />
      <ComparisonMatrix />

      <section className="w-full px-space-lg py-space-xl lg:px-margin">
        <div className="mx-auto max-w-3xl rounded-lg border-outline-variant/40 bg-surface-container p-space-lg text-center">
          <h2 className="font-display text-headline-md text-on-surface">
            Read the contracts, not the marketing
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-body-md text-on-surface-variant">
            Every rule described here is enforced in Solidity. The test suite
            covers the full lifecycle including rejected milestones, failed
            quorum, refunds after a cancelled raise, and frozen transfers during a
            dispute.
          </p>
          <Link
            href="/faq"
            className="mt-4 inline-flex items-center gap-2 rounded bg-surface-container-high px-space-md py-2.5 font-mono text-label-lg text-on-surface transition-colors hover:bg-surface-bright"
          >
            <Icon name="help" size={18} />
            Read the FAQ and risk disclosure
          </Link>
        </div>
      </section>
    </>
  );
}
