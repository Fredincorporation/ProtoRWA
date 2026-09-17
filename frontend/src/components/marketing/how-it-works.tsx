import Link from 'next/link';

import { Icon } from '@/components/ui/icon';

/**
 * "How ProtoRWA Operates in 4 Steps".
 *
 * Layout is ported faithfully: a 2x2 (lg: 4-col) card grid, each with a large
 * mono step number at 30% opacity, a tinted icon, a headline, body copy, and a
 * mono "footer" label describing an implementation detail.
 *
 * COPY REVIEW REQUIRED - the source design specified integrations that do not
 * exist in this build. Each one is replaced below with what the contracts
 * actually do:
 *
 *   step 1  no change (project registration is real)
 *   step 2  "Robinhood Subnet multisig escrow" + hardcoded 30/40/30 split
 *           -> the real mechanism is MilestoneEscrow with a founder-defined
 *              schedule whose tranches must sum to the target.
 *   step 3  "SGS, TÜV SÜD factory inspectors", "Chainlink Oracles",
 *           "ISO 9001 Factory Feeds"
 *           -> not integrated. Evidence is founder-submitted to IPFS and
 *              reviewed by a holder vote; the oracle is a manual admin backstop.
 *   step 4  "Automated Yield", "off-chain Stripe/B2B revenues"
 *           -> not built. What exists is voting-gated tranche release plus a
 *              SecondaryMarket for claims.
 *   The pipeline bar's "0x8849c7198e...399E20" was a fabricated bytecode address;
 *   it now reads from the deployed address or says plainly that nothing is
 *   deployed. Do not restore invented addresses - they are trivially falsified.
 */

interface Step {
  number: string;
  icon: string;
  tone: 'primary' | 'secondary' | 'tertiary';
  title: string;
  body: string;
  footer: string;
}

const toneText = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  tertiary: 'text-tertiary',
} as const;

const toneNumber = {
  primary: 'text-primary/30',
  secondary: 'text-secondary/30',
  tertiary: 'text-tertiary/30',
} as const;

const steps: Step[] = [
  {
    number: '01',
    icon: 'inventory_2',
    tone: 'primary',
    title: 'Register the Hardware Build',
    body: 'A founder publishes the product, bill of materials, target raise and manufacturing plan, then defines the escrow milestone schedule.',
    footer: 'Registry: ProjectRegistry.sol',
  },
  {
    number: '02',
    icon: 'lock',
    tone: 'secondary',
    title: 'Milestone-Locked Escrow',
    body: 'Capital is committed and custodied in MilestoneEscrow. Tranche amounts are set by the founder up front and must sum exactly to the funding target, so every unit of capital has an assigned release condition.',
    footer: 'Custody: MilestoneEscrow.sol',
  },
  {
    number: '03',
    icon: 'fact_check',
    tone: 'tertiary',
    title: 'Evidence and Holder Review',
    body: 'At each milestone the founder submits production evidence to IPFS. Vote weight is snapshotted at submission, and claim holders approve or reject within the review window. A protocol oracle can escalate a disputed milestone.',
    footer: 'Attestation: founder evidence + holder vote',
  },
  {
    number: '04',
    icon: 'how_to_vote',
    tone: 'primary',
    title: 'Tranche Release and Secondary Trade',
    body: 'An approved milestone releases its tranche to the founder. Claims remain tradeable throughout on the secondary market, so holders are not locked in until delivery.',
    footer: 'Settlement: SecondaryMarket.sol',
  },
];

/** Shows the real deployed address, or says so plainly. */
function ContractFactoryBar() {
  const address = process.env.NEXT_PUBLIC_PROJECT_REGISTRY;

  return (
    <div className="flex flex-col items-center justify-between gap-space-sm rounded-lg bg-surface-container p-space-md lg:flex-row">
      <div className="flex items-center gap-space-sm">
        <Icon name="developer_board" size={24} className="text-primary" />
        <div>
          <div className="font-mono text-label-md font-bold text-on-surface">
            Contracts: ProjectRegistry.sol, MilestoneEscrow.sol, SecondaryMarket.sol
          </div>
          <div className="font-mono text-body-sm text-on-surface-variant">
            {address ? (
              <>
                ProjectRegistry: <span className="text-primary">{address}</span>
              </>
            ) : (
              'Not deployed on this network yet.'
            )}
          </div>
        </div>
      </div>
      <Link
        href="/how-it-works"
        data-path="how-it-works"
        className="rounded bg-surface-container-high px-space-md py-2 font-mono text-label-md text-on-surface transition-colors hover:bg-surface-bright"
      >
        Read the protocol mechanism
      </Link>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section className="w-full bg-surface-container-lowest px-space-lg py-space-xl lg:px-margin">
      <div className="mx-auto max-w-7xl space-y-space-lg">
        <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-end">
          <div className="max-w-xl">
            <div className="mb-1 font-mono text-label-md uppercase tracking-widest text-primary">
              {'//'} Protocol Mechanics
            </div>
            <h2 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
              How ProtoRWA Operates
            </h2>
            <p className="mt-2 text-body-md text-on-surface-variant">
              Four stages from a hardware concept to released capital, each one
              enforced by the contracts rather than by trust.
            </p>
          </div>
          {/* Aligned to the heading baseline; previously it floated above. */}
          <div className="self-end font-mono text-label-sm text-outline">
            REF: PROTO-MECHANICS {'//'} ESCROW LIFECYCLE
          </div>
        </div>

        <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <div
              key={step.number}
              className="relative flex-col space-y-space-sm rounded-lg bg-surface-container p-space-md"
            >
              <div className="flex items-center justify-between">
                <span className={`font-display text-headline-lg font-bold ${toneNumber[step.tone]}`}>
                  {step.number}
                </span>
                <Icon name={step.icon} size={28} className={toneText[step.tone]} />
              </div>
              <h3 className="font-display text-headline-sm text-on-surface">{step.title}</h3>
              <p className="text-body-sm text-on-surface-variant">{step.body}</p>
              <div className="pt-2 font-mono text-label-sm text-outline">{step.footer}</div>
            </div>
          ))}
        </div>

        <ContractFactoryBar />
      </div>
    </section>
  );
}
