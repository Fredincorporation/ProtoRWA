import Link from 'next/link';

import { BrandMark } from '@/components/ui/brand';

/**
 * Site footer.
 *
 * Structure and copy follow the design (5-column grid, protocol/infrastructure
 * link groups, contract registry chips, status line).
 *
 * COMPLIANCE NOTE: the source design advertises "OpenZeppelin Audited",
 * "Arbitrum One Verified" and "Chainlink IoT Feeds". None of those are true for
 * this deployment, so they are NOT rendered. Replace `attestations` with real,
 * verifiable claims - or leave it empty - before this goes in front of judges or
 * users. Shipping an unearned audit badge is a misrepresentation, not a detail.
 */

const attestations: Array<{ label: string; tone: 'primary' | 'secondary' | 'tertiary' }> = [
  // Add only claims you can substantiate, e.g.:
  // { label: 'Contracts Verified on Arbiscan', tone: 'primary' },
];

const footerColumns: Array<{ heading: string; links: Array<{ label: string; href: string }> }> = [
  {
    heading: 'Protocol',
    links: [
      { label: 'Asset Directory', href: '/explore' },
      { label: 'Secondary Market', href: '/market' },
      { label: 'Escrow Registry', href: '/governance' },
      { label: 'Oracle Oversight', href: '/governance/oracle' },
    ],
  },
  {
    heading: 'Founders',
    links: [
      { label: 'Create a Project', href: '/studio/new' },
      { label: 'Hardware Attestation', href: '/studio' },
      { label: 'How It Works', href: '/how-it-works' },
      { label: 'Milestone Guide', href: '/how-it-works#milestones' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'FAQ & Risk Disclosure', href: '/faq' },
      { label: 'About the Protocol', href: '/about' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Support', href: '/support' },
    ],
  },
  {
    heading: 'Your Account',
    links: [
      { label: 'Positions & Ledger', href: '/account' },
      { label: 'Notifications', href: '/notifications' },
      { label: 'Governance', href: '/governance' },
      { label: 'Secondary Market', href: '/market' },
    ],
  },
];

/** Registry chips. Addresses come from env so they cannot drift from deploys. */
function ContractRegistry() {
  const contracts = [
    { name: 'ProjectRegistry.sol', address: process.env.NEXT_PUBLIC_PROJECT_REGISTRY },
    { name: 'MilestoneEscrow.sol', address: process.env.NEXT_PUBLIC_MILESTONE_ESCROW },
  ].filter((entry): entry is { name: string; address: string } => Boolean(entry.address));

  if (contracts.length === 0) {
    return (
      <p className="font-mono text-label-sm text-outline">
        Not deployed yet. Addresses appear here once contracts are deployed.
      </p>
    );
  }

  return (
    <div className="space-y-space-xs">
      {contracts.map((contract) => (
        <div
          key={contract.name}
          className="rounded border-outline-variant/30 bg-surface-container-low p-2"
        >
          <div className="text-on-surface-variant">{contract.name}</div>
          <div className="truncate font-mono text-primary">{contract.address}</div>
        </div>
      ))}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="w-full border-t border-outline-variant/30 bg-surface-container-lowest text-on-surface-variant">
      <div className="w-full px-space-lg py-space-xl lg:px-margin">
        {/*
         * Footer columns.
         *
         * `lg:grid-cols-7` (brand spanning 2 + five link columns) overflowed the
         * container and clipped the last column, because seven tracks plus the
         * brand's double span is wider than the available space at 1440px.
         *
         * The brand block now takes its own full-width row edge-to-edge with
         * `col-span-full`, and the link columns sit on a 5-track grid below.
         * That removes the arithmetic coupling entirely: adding a link column no
         * longer requires recounting the span of the brand block.
         */}
        <div className="grid grid-cols-1 gap-space-lg border-b border-outline-variant/20 pb-space-lg md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-space-md md:col-span-2 lg:col-span-full">
            <div className="flex items-center gap-space-sm">
              <BrandMark size={24} />
              <span className="font-display text-headline-sm uppercase leading-none text-on-surface">
                ProtoRWA
              </span>
            </div>
            <p className="max-w-sm text-body-sm text-on-surface-variant">
              Underwriting physical hardware production with milestone-gated
              escrow. Claims are released against verified production evidence,
              and tradeable on a secondary market.
            </p>
            {attestations.length > 0 ? (
              <div className="flex flex-wrap items-center gap-space-xs pt-space-xs">
                {attestations.map((item) => (
                  <span
                    key={item.label}
                    className="rounded border-outline-variant/40 bg-surface-container px-2 py-0.5 font-mono text-label-sm uppercase tracking-wider"
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {footerColumns.map((column) => (
            <div key={column.heading} className="space-y-space-sm">
              <div className="font-mono text-label-md uppercase tracking-wider text-on-surface">
                {column.heading}
              </div>
              <ul className="space-y-space-xs text-body-sm">
                {column.links.map((link) => (
                  <li key={`${column.heading}-${link.href}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="space-y-space-sm">
            <div className="font-mono text-label-md uppercase tracking-wider text-on-surface">
              Contract Registry
            </div>
            <ContractRegistry />
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-space-sm pt-space-md font-mono text-label-sm text-outline md:flex-row">
          <p>&copy; {new Date().getFullYear()} ProtoRWA Protocol.</p>
          <div className="flex items-center gap-space-md">
            <Link href="/faq" className="transition-colors hover:text-primary">
              Risk Disclosure
            </Link>
            <span>Not investment advice</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
