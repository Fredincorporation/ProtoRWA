import { Icon } from '@/components/ui/icon';

/**
 * Architecture breakdown and comparison matrix.
 *
 * Ported from the design: a 5-column feature comparison table with the ProtoRWA
 * column highlighted, plus a layered architecture diagram.
 *
 * COMPARISON TABLE - content is kept close to the source because these are
 * structural, checkable claims about *mechanism* (who holds the money, who can
 * exit, who approves release). The one category removed is the source's
 * "Risk-Adjusted Return Profile" row, which asserted a better return and is a
 * projection, not a mechanism.
 */

interface MatrixRow {
  icon: string;
  feature: string;
  /** ProtoRWA column. */
  protocol: string;
  /** Highlighted style differs for the protocol column only. */
  crowdfunding: string;
  equity: string;
  debt: string;
}

const rows: MatrixRow[] = [
  {
    icon: 'pie_chart',
    feature: 'Cap table dilution',
    protocol: 'None. Claims sit outside the cap table.',
    crowdfunding: 'None, but no claim on output either.',
    equity: '20-35% per round.',
    debt: 'None, but a fixed repayment obligation.',
  },
  {
    icon: 'account_balance',
    feature: 'Who holds the capital',
    protocol: 'MilestoneEscrow until each tranche is approved.',
    crowdfunding: 'The creator, on campaign close.',
    equity: 'The company.',
    debt: 'The company, against future receipts.',
  },
  {
    icon: 'gavel',
    feature: 'Release control',
    protocol: 'Claim-holder vote per milestone.',
    crowdfunding: 'None. No mechanism to withhold funds.',
    equity: 'Board and investor governance.',
    debt: 'Covenant and payment schedule.',
  },
  {
    icon: 'swap_horiz',
    feature: 'Exit before delivery',
    protocol: 'Secondary market for claims, at any time.',
    crowdfunding: 'Not possible.',
    equity: 'Illiquid until IPO or acquisition.',
    debt: 'Secondary loan trading, where available.',
  },
  {
    icon: 'receipt_long',
    feature: 'What backs the position',
    protocol: 'Escrowed capital plus a claim on produced units.',
    crowdfunding: 'A promise of a reward.',
    equity: 'Company shares.',
    debt: 'A contractual repayment claim.',
  },
  {
    icon: 'visibility',
    feature: 'Evidence of progress',
    protocol: 'Founder-submitted artefacts, hash-addressed and holder-reviewed.',
    crowdfunding: 'Campaign updates, unverified.',
    equity: 'Board reporting.',
    debt: 'Periodic financial statements.',
  },
];

const layers = [
  {
    icon: 'layers',
    title: 'Registry layer',
    body: 'ProjectRegistry holds the project record, the raise structure and the milestone schedule. It is the source of truth for status.',
    contract: 'ProjectRegistry.sol',
  },
  {
    icon: 'lock',
    title: 'Custody layer',
    body: 'MilestoneEscrow holds committed capital and releases it one tranche at a time against approved evidence. Founders never take custody of undisbursed funds.',
    contract: 'MilestoneEscrow.sol',
  },
  {
    icon: 'token',
    title: 'Claim layer',
    body: 'ClaimToken issues ERC-1155 units per project, so a single approval covers a portfolio and transfers stay cheap. Transfers can be frozen during disputes.',
    contract: 'ClaimToken.sol',
  },
  {
    icon: 'storefront',
    title: 'Liquidity layer',
    body: 'SecondaryMarket settles peer-to-peer listings. Sellers escrow their claims into the market, so a listing can never be unfillable.',
    contract: 'SecondaryMarket.sol',
  },
];

export function ComparisonMatrix() {
  return (
    <section className="w-full bg-surface-container-lowest px-space-lg py-space-xl lg:px-margin">
      <div className="mx-auto max-w-7xl space-y-space-lg">
        <div className="max-w-2xl">
          <div className="font-mono text-label-md uppercase tracking-widest text-primary">
            Mechanism Comparison
          </div>
          <h2 className="mt-1 font-display text-headline-lg text-on-surface">
            ProtoRWA vs Legacy Capital Channels
          </h2>
          <p className="mt-2 text-body-md text-on-surface-variant">
            The differences below are structural: who holds the money, who can
            exit, and who decides when capital is released. No return is implied
            or projected.
          </p>
        </div>

        <div className="overflow-x-auto rounded bg-surface-container-low shadow-xl">
          <table className="w-full text-left text-body-sm">
            <caption className="sr-only">
              Comparison of ProtoRWA against crowdfunding, venture equity and debt
              financing across six structural parameters.
            </caption>
            <thead>
              <tr className="bg-surface-container-high font-mono text-label-md text-on-surface">
                <th scope="col" className="p-space-md uppercase tracking-wider">
                  Feature / Parameter
                </th>
                <th
                  scope="col"
                  className="bg-primary/15 p-space-md uppercase tracking-wider text-primary"
                >
                  ProtoRWA Hardware Claims
                </th>
                <th scope="col" className="p-space-md uppercase tracking-wider text-on-surface-variant">
                  Crowdfunding
                </th>
                <th scope="col" className="p-space-md uppercase tracking-wider text-on-surface-variant">
                  Venture Equity
                </th>
                <th scope="col" className="p-space-md uppercase tracking-wider text-on-surface-variant">
                  Debt / RBF
                </th>
              </tr>
            </thead>
            <tbody className="text-on-surface">
              {rows.map((row) => (
                <tr
                  key={row.feature}
                  className="border-t border-outline-variant/20 transition-colors hover:bg-surface-container"
                >
                  <th scope="row" className="p-space-md text-left font-semibold text-on-surface">
                    <span className="flex items-center gap-2">
                      <Icon name={row.icon} size={18} className="text-outline" />
                      <span>{row.feature}</span>
                    </span>
                  </th>
                  <td className="bg-primary/10 p-space-md font-medium text-primary">
                    {row.protocol}
                  </td>
                  <td className="p-space-md text-on-surface-variant">{row.crowdfunding}</td>
                  <td className="p-space-md text-on-surface-variant">{row.equity}</td>
                  <td className="p-space-md text-on-surface-variant">{row.debt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function ArchitectureLayers() {
  return (
    <section className="w-full bg-surface-container-lowest px-space-lg py-space-xl lg:px-margin">
      <div className="mx-auto max-w-7xl space-y-space-lg">
        <div className="max-w-2xl">
          <div className="font-mono text-label-md uppercase tracking-widest text-primary">
            Contract Architecture
          </div>
          <h2 className="mt-1 font-display text-headline-lg text-on-surface">
            Four Layers, Separated by Responsibility
          </h2>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Each layer has one job. Records live in the registry, money lives in
            escrow, claims live in the token, and trading lives in the market.
          </p>
        </div>

        <ol className="grid grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-4">
          {layers.map((layer, index) => (
            <li
              key={layer.title}
              className="flex-col gap-space-sm rounded bg-surface-container p-space-lg"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-label-md text-outline">
                  L{index + 1}
                </span>
                <Icon name={layer.icon} size={24} className="text-primary" />
              </div>
              <h3 className="font-display text-headline-sm text-on-surface">{layer.title}</h3>
              <p className="flex-grow text-body-sm text-on-surface-variant">{layer.body}</p>
              <div className="border-t border-outline-variant/30 pt-space-sm font-mono text-label-sm text-secondary">
                {layer.contract}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
