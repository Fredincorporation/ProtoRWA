import type { Metadata } from 'next';
import Link from 'next/link';

import { Notice, DocPage, type DocSection } from '@/components/layout/doc-page';
import { Icon } from '@/components/ui/icon';

export const metadata: Metadata = {
  title: 'About the Protocol',
  description:
    'Why ProtoRWA exists, what problem it addresses in hardware financing, and what it deliberately does not claim to do.',
};

const sections: DocSection[] = [
  {
    id: 'thesis',
    title: 'The problem',
    content: (
      <>
        <p>
          Financing physical hardware is awkward. Equity capital is expensive:
          founders give up 20-35% of a company to buy tooling and inventory, then
          wait years for an illiquid outcome. Consumer crowdfunding is the
          opposite failure — backers hand over the full amount before tooling is
          proven, with no escrow, no tranche control and no recourse if the build
          stalls.
        </p>
        <p>
          Neither structure lets a backer fund a specific product line and exit
          when they want to. Both force an all-or-nothing bet on the whole company
          or on a single promise.
        </p>
      </>
    ),
  },
  {
    id: 'approach',
    title: 'The approach',
    content: (
      <>
        <p>
          ProtoRWA treats a hardware build as a series of verifiable production
          checkpoints rather than a single bet. Capital is escrowed on-chain and
          released tranche by tranche, and each release is gated on evidence that
          claim holders approve.
        </p>
        <p>
          The result is a structure where the founder keeps the cap table, backers
          keep leverage over the money until production is demonstrated, and the
          position stays tradeable throughout. Each party&apos;s incentive points
          at the same thing: getting real units built.
        </p>
      </>
    ),
  },
  {
    id: 'what-we-built',
    title: 'What is actually built',
    content: (
      <>
        <Notice tone="brand" title="Status: prototype">
          <p>
            This is a working prototype, not a live financial product. The
            contracts are written and tested; the interface runs on seeded
            demonstration data. No capital has been raised and no hardware
            projects are live for commitment.
          </p>
        </Notice>

        <p>What exists and is verifiable in the repository:</p>
        <ul className="ml-4 list-disc space-y-3">
          <li>
            <strong className="text-on-surface">Four Solidity contracts</strong> —{' '}
            <code className="font-mono text-primary">ProjectRegistry</code>,{' '}
            <code className="font-mono text-primary">MilestoneEscrow</code>,{' '}
            <code className="font-mono text-primary">ClaimToken</code> (ERC-1155)
            and <code className="font-mono text-primary">SecondaryMarket</code> —
            built on OpenZeppelin primitives.
          </li>
          <li>
            <strong className="text-on-surface">A Foundry test suite</strong>{' '}
            covering the full lifecycle: commitments and oversubscription;
            settlement when the target is met and missed; evidence snapshotting;
            double-vote rejection; quorum and approval-threshold failures;
            post-snapshot transfer isolation; pro-rata refunds; secondary
            settlement and fees; frozen transfers; and oracle resolution.
          </li>
          <li>
            <strong className="text-on-surface">A deploy script</strong> that wires
            the role graph between contracts and prints a ready-to-use
            configuration.
          </li>
          <li>
            <strong className="text-on-surface">The interface</strong> — project
            discovery, a project page with the milestone timeline and voting desk,
            a founder wizard with an AI structuring assistant, and the secondary
            market.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'what-we-dont-claim',
    title: 'What we do not claim',
    content: (
      <>
        <p>
          The protocol removes some risks and leaves others entirely alone. Escrow
          means a founder cannot withdraw undisbursed capital, but it does not make
          hardware easy to build. Production can slip, suppliers can fail, and a
          build that works as a prototype can fail in volume.
        </p>
        <ul className="ml-4 list-disc space-y-2">
          <li>The contracts are <strong className="text-on-surface">unaudited</strong>.</li>
          <li>There is <strong className="text-on-surface">no live deployment</strong> carrying real funds.</li>
          <li>No certification, partnership or third-party audit is claimed or implied.</li>
          <li>No return is promised, projected or modelled anywhere on this site.</li>
        </ul>
        <p>
          Disputed milestones are resolved by a protocol administrator, which is a
          real trust assumption in an otherwise automated mechanism. It is stated
          plainly rather than described as decentralised.
        </p>
      </>
    ),
  },
  {
    id: 'principles',
    title: 'Design principles',
    content: (
      <dl className="flex flex-col gap-space-sm">
        <div className="rounded bg-surface-container-lowest p-space-sm">
          <dt className="font-mono text-label-md uppercase tracking-wider text-primary">
            No custody by the founder
          </dt>
          <dd className="mt-1 text-body-sm text-on-surface-variant">
            Undisbursed capital sits in a contract with rules fixed at registration.
          </dd>
        </div>
        <div className="rounded bg-surface-container-lowest p-space-sm">
          <dt className="font-mono text-label-md uppercase tracking-wider text-primary">
            Snapshot, not live weight
          </dt>
          <dd className="mt-1 text-body-sm text-on-surface-variant">
            Voting power is fixed when evidence is submitted, which protects
            long-term holders and makes trading during a vote safe.
          </dd>
        </div>
        <div className="rounded bg-surface-container-lowest p-space-sm">
          <dt className="font-mono text-label-md uppercase tracking-wider text-primary">
            Permissionless settlement
          </dt>
          <dd className="mt-1 text-body-sm text-on-surface-variant">
            Anyone can finalise a closed review, because the result is a function
            of recorded votes. No keeper is needed and no one can block it.
          </dd>
        </div>
        <div className="rounded bg-surface-container-lowest p-space-sm">
          <dt className="font-mono text-label-md uppercase tracking-wider text-primary">
            Escrowed
          </dt>
          <dd className="mt-1 text-body-sm text-on-surface-variant">
            A seller moves claims into the market when listing, so an active
            listing cannot become unfillable.
          </dd>
        </div>
      </dl>
    ),
  },
];

export default function AboutPage() {
  return (
    <DocPage
      kicker="// Protocol Vision"
      title="About ProtoRWA"
      intro="A protocol for financing physical hardware against production milestones rather than equity. This page explains the reasoning, the current state of the build, and the limits we are not going to paper over."
      sections={sections}
      footer={
        <div className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
          <h2 className="font-display text-headline-sm text-on-surface">
            Look at the mechanism
          </h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            The claims above are checkable. The contract rules are described on the
            How It Works page, and the risk disclosure is in the FAQ.
          </p>
          <div className="mt-space-sm flex-wrap gap-space-sm">
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-2 rounded bg-primary px-space-md py-2 font-mono text-label-md text-on-primary"
            >
              <Icon name="account_tree" size={16} />
              How it works
            </Link>
            <Link
              href="/faq"
              className="inline-flex items-center gap-2 rounded bg-surface-container-high px-space-md py-2 font-mono text-label-md text-on-surface transition-colors hover:bg-surface-bright"
            >
              <Icon name="gpp_maybe" size={16} />
              Risk disclosure
            </Link>
          </div>
        </div>
      }
    />
  );
}
