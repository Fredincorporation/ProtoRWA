import type { Metadata } from 'next';
import Link from 'next/link';

import { Notice, DocPage, type DocSection } from '@/components/layout/doc-page';
import { Icon } from '@/components/ui/icon';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Terms governing use of the ProtoRWA interface and participation in the protocol.',
};

/**
 * Terms of use.
 *
 * IMPORTANT: this is a good-faith prototype document, not legal advice and not a
 * substitute for review by qualified counsel. The clauses that matter (no advice,
 * assumption of loss, unaudited software, jurisdiction) are present and honest,
 * but a real deployment needs a lawyer's version. That is flagged in the page
 * rather than buried.
 */

const sections: DocSection[] = [
  {
    id: 'acceptance',
    title: 'Acceptance',
    content: (
      <p>
        By using this interface you agree to these terms. If you do not accept
        them, do not use the interface or interact with the contracts.
      </p>
    ),
  },
  {
    id: 'what-this-is',
    title: 'What this interface is',
    content: (
      <>
        <p>
          This interface is software that helps you read protocol state and
          construct transactions. It is not a broker, dealer, exchange, custodian,
          fund, adviser or intermediary. It does not hold your assets, does not
          execute transactions on your behalf, and does not take a position in any
          project.
        </p>
        <p>
          The contracts are deployed on a public blockchain and are permissionless.
          Anyone can interact with them directly without using this interface — and
          if you do use this interface, the resulting transaction is yours alone.
        </p>
      </>
    ),
  },
  {
    id: 'no-advice',
    title: 'No advice, no recommendation',
    content: (
      <>
        <Notice tone="warn" title="Nothing here is investment, legal or tax advice">
          <p>
            Project descriptions are supplied by founders. The presence of a
            project on this interface is not a recommendation, endorsement or
            assessment of its merits by anyone associated with the protocol.
          </p>
        </Notice>
        <p>
          You are solely responsible for your own diligence, for evaluating your
          own risk tolerance, and for determining whether participation is lawful
          for you in your jurisdiction. Consult your own advisers.
        </p>
      </>
    ),
  },
  {
    id: 'assumption-of-risk',
    title: 'Assumption of risk',
    content: (
      <>
        <p>
          You accept that you may lose all capital you commit. Without limitation,
          you accept the risks described in the{' '}
          <Link href="/faq#risks" className="text-primary underline">
            risk disclosure
          </Link>
          , including production risk, delivery risk, governance and quorum
          failure, oracle discretion, illiquidity, smart-contract error, misleading
          evidence, and regulatory change.
        </p>
        <p>
          Escrow reduces the risk that a founder withdraws undisbursed capital. It
          does not eliminate any other risk, and it is not a guarantee of delivery
          or of value.
        </p>
      </>
    ),
  },
  {
    id: 'unaudited',
    title: 'Unaudited software',
    content: (
      <>
        <p>
          The smart contracts have <strong>not been audited</strong> by any third
          party. They are provided as-is, without warranty of any kind, express or
          implied, including merchantability, fitness for a particular purpose, and
          non-infringement.
        </p>
        <p>
          No member of the project is liable for any loss arising from use of the
          contracts or this interface, including loss caused by bugs, exploits,
          chain congestion, wallet error, or an incorrect price or figure displayed
          here. Any displayed figure that is derived from on-chain state is
          indicative; the chain is authoritative.
        </p>
      </>
    ),
  },
  {
    id: 'eligibility',
    title: 'Eligibility and compliance',
    content: (
      <>
        <p>
          You are responsible for complying with all laws applicable to you. You
          must not use this interface if doing so would breach sanctions, licensing
          or securities requirements in your jurisdiction, or if you are acting on
          behalf of a person who is subject to such restrictions.
        </p>
        <p>
          The regulatory treatment of tokenized real-world assets is unsettled and
          varies by jurisdiction. A claim may be characterised differently in
          different places and the position may change over time.
        </p>
      </>
    ),
  },
  {
    id: 'founder-obligations',
    title: 'Founder obligations',
    content: (
      <>
        <p>If you register a project, you additionally agree that:</p>
        <ul className="ml-4 list-disc space-y-2">
          <li>
            Evidence you submit is accurate and not misleading, and you will not
            submit fabricated, altered or misattributed material.
          </li>
          <li>
            You will not claim a certification, approval, test result or
            partnership you have not actually obtained.
          </li>
          <li>
            You will disclose material production risk rather than presenting a
            build as more certain than it is.
          </li>
          <li>
            You understand tranche amounts are fixed at registration and cannot be
            reallocated after funding opens.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'third-party',
    title: 'Third-party content and services',
    content: (
      <p>
        Project media and milestone evidence are stored on IPFS and retrieved via
        public gateways. This interface does not control, verify or host that
        content. AI-assisted drafting features may produce inaccurate output; you
        are responsible for reviewing anything before publishing it. Wallet
        connection is provided by third-party software subject to its own terms.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes and governing terms',
    content: (
      <>
        <Notice tone="danger" title="Prototype document — requires legal review">
          <p>
            This is a draft written for a prototype deployment. It has not been
            reviewed by counsel and should not be relied on as a complete or
            enforceable agreement. A live deployment requires a properly drafted
            version specifying governing law, jurisdiction and dispute resolution.
          </p>
        </Notice>
        <p>
          These terms may be updated as the protocol changes. Continued use after
          an update constitutes acceptance of the revised terms.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <DocPage
      kicker="// Terms & Compliance"
      title="Terms of Service"
      intro="The rules governing your use of this interface, and the risk you accept by using it. Plain language on purpose: the important clauses are the ones you should actually read."
      sections={sections}
      footer={
        <div className="rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
          <h2 className="font-display text-headline-sm text-on-surface">
            Related documents
          </h2>
          <div className="mt-space-sm flex-wrap gap-space-sm">
            <Link
              href="/faq"
              className="inline-flex items-center gap-2 rounded bg-surface-container-high px-space-md py-2 font-mono text-label-md text-on-surface transition-colors hover:bg-surface-bright"
            >
              <Icon name="gpp_maybe" size={16} />
              FAQ & risk disclosure
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center gap-2 rounded bg-surface-container-high px-space-md py-2 font-mono text-label-md text-on-surface transition-colors hover:bg-surface-bright"
            >
              <Icon name="info" size={16} />
              About the protocol
            </Link>
          </div>
        </div>
      }
    />
  );
}
