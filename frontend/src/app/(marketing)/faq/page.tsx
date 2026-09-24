import type { Metadata } from 'next';
import Link from 'next/link';

import { DocPage, Notice, type DocSection } from '@/components/layout/doc-page';
import { Icon } from '@/components/ui/icon';
import { PROTOCOL } from '@protorwa/shared';

export const metadata: Metadata = {
  title: 'FAQ & Risk Disclosure',
  description:
    'How ProtoRWA escrow, milestone voting and the secondary market work, and the risks a claim holder should understand before committing capital.',
};

const sections: DocSection[] = [
  {
    id: 'what-is-a-claim',
    title: 'What exactly is a claim?',
    content: (
      <>
        <p>
          A claim is an ERC-1155 token unit minted against committed capital. If
          you commit at a claim price of 5 USDG, 1,000 units cost 5,000 USDG and you
          hold 1,000 units.
        </p>
        <p>
          A claim is <strong>not equity</strong>. It carries no ownership,
          dividend or governance rights in any company. What it represents is a
          position in the project&apos;s escrow: a proportional right to vote on
          milestone releases, and a proportional right to any refund if the
          project is cancelled or defaults.
        </p>
      </>
    ),
  },
  {
    id: 'where-is-the-money',
    title: 'Where does my money go when I commit?',
    content: (
      <>
        <p>
          Into <code className="font-mono text-primary">MilestoneEscrow</code>,
          not to the founder. The registry forwards committed value to escrow at
          the moment of commitment.
        </p>
        <p>
          The founder can only receive funds when a specific tranche is released.
          Tranche amounts are fixed when the project is registered and must sum
          exactly to the funding target, so every unit of committed capital has an
          assigned release condition before funding opens.
        </p>
      </>
    ),
  },
  {
    id: 'how-release-works',
    title: 'How does a milestone release actually work?',
    content: (
      <>
        <p>The sequence is fixed in the contract:</p>
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>The founder submits production evidence for a milestone.</li>
          <li>
            The contract snapshots every indexed holder&apos;s claim balance. That
            snapshot becomes their vote weight.
          </li>
          <li>
            Holders vote <strong>approve</strong>, <strong>reject</strong> or{' '}
            <strong>abstain</strong> within the review window.
          </li>
          <li>
            After the window closes, anyone may trigger settlement. It is
            permissionless because the outcome is a pure function of recorded
            votes.
          </li>
          <li>
            Release requires <em>both</em> quorum (
            {PROTOCOL.DEFAULT_QUORUM_BPS / 100}% of snapshotted eligible weight by
            default) <em>and</em> approval of at least{' '}
            {PROTOCOL.DEFAULT_APPROVAL_THRESHOLD_BPS / 100}% of eligible weight.
            Failing either keeps the capital in escrow.
          </li>
        </ol>
        <p>
          Vote weight is snapshotted at submission, so claims bought after
          evidence is posted cannot influence that milestone&apos;s outcome.
        </p>
      </>
    ),
  },
  {
    id: 'why-snapshots',
    title: 'Why is vote weight snapshotted rather than counted live?',
    content: (
      <p>
        Without a snapshot, a holder could borrow or buy claims, vote, and
        immediately sell, while genuinely long-term holders had no protection. The
        snapshot fixes each voter&apos;s influence to the moment the review opened,
        which is also what makes a secondary-market transfer safe to execute during
        an open vote.
      </p>
    ),
  },
  {
    id: 'what-if-founder-fails',
    title: 'What happens if the founder fails to deliver?',
    content: (
      <>
        <p>
          If milestones are rejected, the tranches attached to them stay in
          escrow. A protocol oracle can escalate a disputed milestone and resolve
          it, either releasing or rejecting.
        </p>
        <p>
          If a project is marked <strong>CANCELLED</strong> (target not met) or{' '}
          <strong>DEFAULTED</strong>, holders can claim a pro-rata refund from the
          remaining escrow balance and their claims are burned.
        </p>
        <p>
          Escrow reduces counterparty risk — the founder cannot simply walk off
          with the money — but it does <strong>not</strong> remove production risk.
          Hardware can still be late, over cost, or fail to ship.
        </p>
      </>
    ),
  },
  {
    id: 'secondary-market',
    title: 'How does the secondary market work?',
    content: (
      <>
        <p>
          A holder lists claims by transferring them into{' '}
          <code className="font-mono text-primary">SecondaryMarket</code> at an ask
          price. Escrowing the units on list means a listing can never turn out to
          be unfillable because the seller moved the tokens.
        </p>
        <p>
          The seller may cancel at any time and reclaim unsold units. A protocol
          fee of {PROTOCOL.SECONDARY_FEE_BPS / 100}% applies on settlement, fixed
          at listing time so a later fee change cannot alter an open order.
        </p>
      </>
    ),
  },
  {
    id: 'risks',
    title: 'Risk disclosure',
    content: (
      <>
        <Notice tone="danger" title="Read this before committing capital">
          <p>
            Participating in a tokenized hardware project can result in the total
            loss of the capital you commit. Nothing on this site is investment
            advice, and no return is promised, projected or implied.
          </p>
        </Notice>

        <p>The material risks include, at minimum:</p>
        <ul className="ml-4 list-disc space-y-2">
          <li>
            <strong className="text-on-surface">Production risk.</strong> Hardware
            is hard. Tooling can slip, yields can disappoint, suppliers can fail,
            and a build that passes a pilot batch can still fail in volume.
          </li>
          <li>
            <strong className="text-on-surface">Delivery risk.</strong> Approving
            a tranche releases capital; it does not guarantee that the finished
            units arrive, or arrive on time.
          </li>
          <li>
            <strong className="text-on-surface">Governance risk.</strong> If
            holders do not turn out to vote, quorum can fail and a tranche can stay
            locked even when the founder has genuine evidence.
          </li>
          <li>
            <strong className="text-on-surface">Oracle risk.</strong> Disputed
            milestones are resolved by a protocol administrator. That is a trust
            assumption in an otherwise automated flow.
          </li>
          <li>
            <strong className="text-on-surface">Liquidity risk.</strong> The
            secondary market is peer-to-peer. There may be no buyer at any price,
            and a &quot;floor price&quot; on a listing is not a valuation.
          </li>
          <li>
            <strong className="text-on-surface">Smart-contract risk.</strong> The
            contracts are unaudited. An error could result in loss of funds.
          </li>
          <li>
            <strong className="text-on-surface">Evidence-verification risk.</strong>{' '}
            Evidence is submitted by the founder and reviewed by holders. A
            determined bad actor may be able to submit misleading evidence.
          </li>
          <li>
            <strong className="text-on-surface">Regulatory risk.</strong> The
            treatment of tokenized real-world assets varies by jurisdiction and can
            change. You are responsible for your own compliance.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'fees',
    title: 'What are the fees?',
    content: (
      <p>
        The protocol takes {PROTOCOL.SECONDARY_FEE_BPS / 100}% on secondary-market
        settlement only. There is no fee on commitment, on milestone release, or on
        refunds. Network gas is your own cost on every transaction.
      </p>
    ),
  },
  {
    id: 'not-advice',
    title: 'Is this investment advice?',
    content: (
      <p>
        No. This site describes a mechanism. It does not evaluate whether any
        particular project is a sound use of your capital, and it does not
        recommend any position. Do your own diligence on the hardware, the founder
        and the production plan before committing anything.
      </p>
    ),
  },
];

export default function FaqPage() {
  return (
    <DocPage
      kicker="// Reference & Disclosure"
      title="FAQ & Risk Disclosure"
      intro="How escrow, milestone voting and the secondary market work, and what can go wrong. If a claim is explained anywhere else in fewer words than this, that explanation is incomplete."
      sections={sections}
      footer={
        <div className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
          <h2 className="font-display text-headline-sm text-on-surface">
            Still have a question?
          </h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            The mechanism is described in more depth on the How It Works page, and
            the rules above are enforced in the contracts themselves.
          </p>
          <div className="mt-space-sm flex-wrap gap-space-sm">
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-2 rounded bg-surface-container-high px-space-md py-2 font-mono text-label-md text-on-surface transition-colors hover:bg-surface-bright"
            >
              <Icon name="account_tree" size={16} />
              How it works
            </Link>
            <Link
              href="/support"
              className="inline-flex items-center gap-2 rounded bg-surface-container-high px-space-md py-2 font-mono text-label-md text-on-surface transition-colors hover:bg-surface-bright"
            >
              <Icon name="help" size={16} />
              Support
            </Link>
          </div>
        </div>
      }
    />
  );
}
