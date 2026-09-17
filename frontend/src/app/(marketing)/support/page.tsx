import type { Metadata } from 'next';
import Link from 'next/link';

import { DocPage, Notice, type DocSection } from '@/components/layout/doc-page';
import { Icon } from '@/components/ui/icon';

export const metadata: Metadata = {
  title: 'Support',
  description:
    'Troubleshooting for wallet connection, commitments, voting and the secondary market.',
};

const sections: DocSection[] = [
  {
    id: 'wallet',
    title: 'Connecting a wallet',
    content: (
      <>
        <p>
          The interface uses an injected browser wallet (MetaMask, Rabby, or any
          EIP-1193 provider). If no injected wallet is detected, the connect
          button will not be offered a provider to open.
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>Install the wallet extension and unlock it before loading the page.</li>
          <li>
            If the network chip reads{' '}
            <span className="font-mono text-on-surface">Not connected</span>, the
            wallet is locked or the site lacks permission.
          </li>
          <li>
            A wrong-network state blocks commitments. Switch network from the
            wallet button rather than reloading.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'commit-fails',
    title: 'A commitment failed',
    content: (
      <>
        <p>
          Commitment reverts are specific. The contract rejects under these
          conditions, and the reason is visible in the wallet or on the explorer:
        </p>
        <dl className="flex flex-col gap-space-xs">
          {[
            ['Underpaid', 'Value sent does not equal claim units × claim price.'],
            ['Sold out', 'You asked for more units than remain uncommitted.'],
            ['Funding closed', 'The deadline has passed, or funding is not open.'],
            ['Wrong state', 'The project is not in the FUNDING state.'],
          ].map(([label, meaning]) => (
            <div key={label} className="rounded bg-surface-container-lowest p-space-sm">
              <dt className="font-mono text-label-md text-error">{label}</dt>
              <dd className="mt-0.5 text-body-sm text-on-surface-variant">{meaning}</dd>
            </div>
          ))}
        </dl>
        <p>
          Because the price is fixed per unit, a commitment is deterministic: there
          is no slippage, and a pending transaction cannot be filled at a different
          price.
        </p>
      </>
    ),
  },
  {
    id: 'voting',
    title: 'Voting problems',
    content: (
      <>
        <ul className="ml-4 list-disc space-y-2">
          <li>
            <strong className="text-on-surface">No weight to vote with.</strong> A
            vote requires claim units in <em>that</em> project, held at the moment
            the snapshot was taken. Buying claims after evidence was submitted does
            not grant weight for that milestone.
          </li>
          <li>
            <strong className="text-on-surface">Already voted.</strong> One address
            gets one vote per milestone, and it cannot be changed.
          </li>
          <li>
            <strong className="text-on-surface">Review closed.</strong> Voting is
            only possible inside the review window. Once it elapses, anyone may
            settle.
          </li>
        </ul>
        <Notice tone="brand" title="If settlement seems stuck">
          <p>
            Settlement is permissionless, so anyone can finalise a closed review.
            If a review window has elapsed and the project page still shows it as
            in review, the displayed state is stale — it refreshes on the next
            block, and the tranche is released as soon as someone settles.
          </p>
        </Notice>
      </>
    ),
  },
  {
    id: 'market',
    title: 'Listing and trading issues',
    content: (
      <>
        <ul className="ml-4 list-disc space-y-2">
          <li>
            <strong className="text-on-surface">Listing requires an approval.</strong>{' '}
            The market contract has to be approved as an operator on the claim
            token before it can move your units into escrow.
          </li>
          <li>
            <strong className="text-on-surface">Units are escrowed when listed.</strong>{' '}
            A listed balance disappears from your wallet. Cancel the listing to
            reclaim unsold units.
          </li>
          <li>
            <strong className="text-on-surface">Wrong payment amount.</strong> A
            fill must send exactly units × ask price. Partial fills are supported;
            overpaying is rejected.
          </li>
          <li>
            <strong className="text-on-surface">Transfers frozen.</strong> During a
            dispute or after a default, claims in that project cannot be
            transferred. Listings in a frozen project cannot be filled.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'refunds',
    title: 'Claiming a refund',
    content: (
      <p>
        Refunds become available only when a project reaches CANCELLED or
        DEFAULTED. The payout is pro-rata against your current claim balance, and
        your claims are burned on refund, so a refund cannot be claimed twice.
        Nothing needs to be requested in advance.
      </p>
    ),
  },
  {
    id: 'display',
    title: 'Numbers on screen look wrong',
    content: (
      <>
        <p>
          Amounts are stored on-chain in wei and converted for display, so a
          rounding difference of one unit in the last displayed decimal place is
          expected. The chain value is authoritative.
        </p>
        <p>
          Figures marked as demonstration data are seeded for the prototype and do
          not reflect any real project, production run or transaction.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Still stuck',
    content: (
      <>
        <p>
          Most issues are visible on the block explorer: a reverted transaction
          records its reason there. If a value on this interface disagrees with the
          explorer, the explorer is correct.
        </p>
        <p className="font-mono text-label-sm text-outline">
          Support channel: not yet configured for this prototype deployment.
        </p>
      </>
    ),
  },
];

export default function SupportPage() {
  return (
    <DocPage
      kicker="// Help Center"
      title="Support"
      intro="Troubleshooting for the things that actually go wrong: wallet state, reverted commitments, voting eligibility, listing approvals and refunds."
      sections={sections}
      footer={
        <div className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
          <h2 className="font-display text-headline-sm text-on-surface">
            Understand the rules first
          </h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Most failures above are the contract enforcing a rule on purpose. The
            rules are written out in the FAQ.
          </p>
          <Link
            href="/faq"
            className="mt-4 inline-flex items-center gap-2 rounded bg-surface-container-high px-space-md py-2 font-mono text-label-md text-on-surface transition-colors hover:bg-surface-bright"
          >
            <Icon name="help" size={16} />
            FAQ & risk disclosure
          </Link>
        </div>
      }
    />
  );
}
