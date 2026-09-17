import { Icon } from '@/components/ui/icon';

/**
 * "The Manufacturing Capital Dilemma" - three-column contrast matrix.
 *
 * Ported faithfully: the section header with a mono REF label, and three
 * surface-container cards each with a coloured pill, an icon, a headline, a
 * bulleted critique and a collapsed "RESULT:" footer.
 *
 * Unlike the hero, these claims are comparative and defensible (VC dilution
 * ranges, crowdfunding accountability gaps), so the copy is kept close to the
 * source. The one edit: the Kickstarter card's "0% accountability" style
 * absolutes are softened to what is actually demonstrable.
 */

interface ContrastCard {
  label: string;
  icon: string;
  tone: 'danger' | 'warn' | 'brand';
  title: string;
  blurb: string;
  points: Array<{ lead: string; body: string }>;
  result: string;
}

const toneClasses = {
  danger: {
    pill: 'bg-error-container/20 text-error',
    icon: 'text-error',
    marker: 'text-error',
  },
  warn: {
    pill: 'bg-tertiary/20 text-tertiary',
    icon: 'text-tertiary',
    marker: 'text-tertiary',
  },
  brand: {
    pill: 'bg-primary/20 text-primary',
    icon: 'text-primary',
    marker: 'text-primary',
  },
} as const;

const cards: ContrastCard[] = [
  {
    label: 'Traditional VC Model',
    icon: 'domain_disabled',
    tone: 'danger',
    title: 'Equity Dilution',
    blurb:
      'Founders surrender 20-35% equity per funding round simply to purchase tooling dies and raw inventory.',
    points: [
      {
        lead: '7-10 Year Capital Lockup:',
        body: 'Illiquid positions tied to rare IPO or acquisition events.',
      },
      {
        lead: 'Forced Valuation Down-Rounds:',
        body: 'Market shifts punish capital-intensive hardware startups hardest.',
      },
      {
        lead: 'Zero Asset-Level Trading:',
        body: 'Investors cannot exit a single high-performing product line.',
      },
    ],
    result: 'Cap-table destruction and slow production cycles.',
  },
  {
    label: 'Kickstarter / Indiegogo',
    icon: 'warning',
    tone: 'warn',
    title: 'Unaccountable Pre-Orders',
    blurb:
      'Backers hand over full payment upfront with no escrow, no tranche control, and no recourse if the build stalls.',
    points: [
      {
        lead: 'All-or-Nothing Release:',
        body: 'Funds reach the creator on the campaign close, before tooling is proven.',
      },
      {
        lead: 'No Milestone Enforcement:',
        body: 'There is no mechanism to withhold capital when production slips.',
      },
      {
        lead: 'Illiquid Positions:',
        body: 'A backer cannot sell or transfer their commitment if they need out.',
      },
    ],
    result: 'Funded failures with backers holding no claim on the outcome.',
  },
  {
    label: 'ProtoRWA Protocol',
    icon: 'verified',
    tone: 'brand',
    title: 'Milestone-Backed Claims',
    blurb:
      'Capital is escrowed on-chain and released tranche by tranche, only after claim holders approve production evidence.',
    points: [
      {
        lead: 'Zero Equity Dilution:',
        body: 'Founders keep the cap table; the raise is against product output.',
      },
      {
        lead: 'Voting-Gated Release:',
        body: 'Each tranche unlocks on a recorded holder vote against submitted evidence.',
      },
      {
        lead: 'Tradeable Claims:',
        body: 'Holders can list claims on the secondary market at any time.',
      },
    ],
    result: 'Founders keep ownership; backers keep leverage and an exit.',
  },
];

export function ProblemMatrix() {
  return (
    <section className="w-full bg-surface px-space-lg py-space-xl lg:px-margin">
      <div className="mx-auto max-w-7xl space-y-space-lg">
        <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-end">
          <div className="max-w-xl">
            <div className="mb-1 font-mono text-label-md uppercase tracking-widest text-primary">
              {'//'} Market Paradigm Shift
            </div>
            <h2 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
              The Manufacturing Capital Dilemma
            </h2>
            <p className="mt-2 text-body-md text-on-surface-variant">
              Hardware innovation is trapped between dilutive venture rounds and
              crowdfunding platforms that hold backers accountable to nothing.
            </p>
          </div>
          <div className="font-mono text-label-sm text-outline">
            REF: PROTO-THESIS {'//'} CAPITAL EFFICIENCY COMPARATIVE
          </div>
        </div>

        <div className="grid grid-cols-1 gap-space-md md:grid-cols-3">
          {cards.map((card) => {
            const tone = toneClasses[card.tone];
            return (
              <div
                key={card.label}
                className="flex flex-col justify-between space-y-space-md rounded-lg bg-surface-container p-space-md"
              >
                <div className="space-y-space-sm">
                  <div className="flex items-center justify-between">
                    <span
                      className={`rounded px-2.5 py-1 font-mono text-label-sm uppercase ${tone.pill}`}
                    >
                      {card.label}
                    </span>
                    <Icon name={card.icon} className={tone.icon} />
                  </div>

                  <h3 className="font-display text-headline-md text-on-surface">{card.title}</h3>
                  <p className="text-body-sm text-on-surface-variant">{card.blurb}</p>

                  <ul className="space-y-2 pt-2 text-body-sm text-on-surface-variant">
                    {card.points.map((point) => (
                      <li key={point.lead} className="flex items-start gap-2">
                        <Icon
                          name={card.tone === 'brand' ? 'check' : 'close'}
                          size={18}
                          className={`mt-0.5 shrink-0 ${tone.marker}`}
                        />
                        <span>
                          <strong className="text-on-surface">{point.lead}</strong> {point.body}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded bg-surface-container-lowest p-space-sm font-mono text-label-sm text-outline">
                  RESULT: {card.result}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
