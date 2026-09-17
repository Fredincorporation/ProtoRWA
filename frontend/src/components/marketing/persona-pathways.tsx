'use client';

import * as React from 'react';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * Persona pathway switcher.
 *
 * Ported from the design's "Select Protocol Participant Pathway": a segmented
 * toggle with two tabs, each revealing a four-stage lifecycle grid.
 *
 * The source design used two static divs, both present in the DOM, toggled by an
 * inline onclick handler. This is a real tablist instead - keyboard navigable,
 * and only the active panel is rendered, so a screen reader does not read the
 * hidden pathway.
 */

export interface PathwayStage {
  stage: string;
  icon: string;
  title: string;
  body: string;
  /** Mono detail line shown under the description, as in the design. */
  detail?: string;
}

export interface Pathway {
  id: string;
  icon: string;
  label: string;
  stages: PathwayStage[];
}

const pathways: Pathway[] = [
  {
    id: 'founders',
    icon: 'precision_manufacturing',
    label: 'For Hardware Founders',
    stages: [
      {
        stage: 'Stage 01',
        icon: 'receipt_long',
        title: 'Define the build',
        body: 'Record the bill of materials, target unit economics, supplier lead times and the production plan. This becomes the public project record.',
        detail: 'ProjectRegistry.createProject()',
      },
      {
        stage: 'Stage 02',
        icon: 'gavel',
        title: 'Set the raise and milestones',
        body: 'Choose a claim price and supply, then split the raise into tranches. Each tranche is bound to a milestone whose evidence claim holders will review.',
        detail: 'ProjectRegistry.setMilestones()',
      },
      {
        stage: 'Stage 03',
        icon: 'lock',
        title: 'Open funding into escrow',
        body: 'Once the schedule is set, funding opens. Committed capital goes to MilestoneEscrow, not to the founder, and claims mint to each backer on commit.',
        detail: 'MilestoneEscrow.deposit()',
      },
      {
        stage: 'Stage 04',
        icon: 'upload_file',
        title: 'Submit evidence, receive tranches',
        body: 'At each milestone, publish the production evidence. If claim holders approve within the review window, that tranche releases to you.',
        detail: 'MilestoneEscrow.submitEvidence()',
      },
    ],
  },
  {
    id: 'backers',
    icon: 'account_balance_wallet',
    label: 'For Capital Backers',
    stages: [
      {
        stage: 'Stage 01',
        icon: 'search',
        title: 'Review the hardware',
        body: 'Read the bill of materials, the manufacturing location, the raise structure and the milestone schedule before committing anything.',
        detail: 'Explore projects',
      },
      {
        stage: 'Stage 02',
        icon: 'payments',
        title: 'Commit and receive claims',
        body: 'Commit capital at the fixed claim price. Claims mint immediately as ERC-1155 units and represent your share of the escrow.',
        detail: 'ProjectRegistry.commit()',
      },
      {
        stage: 'Stage 03',
        icon: 'how_to_vote',
        title: 'Vote on milestone evidence',
        body: 'Approve or reject each milestone. Your vote weight is snapshotted when evidence is submitted, so claims bought later cannot dilute your influence.',
        detail: 'MilestoneEscrow.vote()',
      },
      {
        stage: 'Stage 04',
        icon: 'swap_horiz',
        title: 'Exit on the secondary market',
        body: 'Claims stay tradeable throughout the build. List them at any time rather than waiting for delivery.',
        detail: 'SecondaryMarket.list()',
      },
    ],
  },
];

export function PersonaPathways() {
  const [active, setActive] = React.useState(pathways[0]!.id);
  const current = pathways.find((pathway) => pathway.id === active) ?? pathways[0]!;

  /** Arrow-key navigation, as expected of a real tablist. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = pathways.findIndex((pathway) => pathway.id === active);
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = (index + delta + pathways.length) % pathways.length;
      setActive(pathways[next]!.id);
    }
  };

  return (
    <section className="w-full px-space-lg py-space-lg lg:px-margin">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-space-md pb-space-lg lg:flex-row lg:items-center">
          <div>
            <div className="font-mono text-label-md uppercase tracking-widest text-primary">
              Execution Lifecycles
            </div>
            <h2 className="mt-1 font-display text-headline-lg text-on-surface">
              Select Protocol Participant Pathway
            </h2>
          </div>

          <div
            role="tablist"
            aria-label="Participant pathway"
            onKeyDown={onKeyDown}
            className="inline-flex self-start rounded bg-surface-container-lowest p-1 shadow-inner lg:self-auto"
          >
            {pathways.map((pathway) => {
              const selected = pathway.id === active;
              return (
                <button
                  key={pathway.id}
                  role="tab"
                  type="button"
                  id={`tab-${pathway.id}`}
                  aria-selected={selected}
                  aria-controls={`panel-${pathway.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(pathway.id)}
                  className={cn(
                    'rounded px-space-md py-2 font-mono text-label-md tracking-wider transition-colors',
                    selected
                      ? 'bg-primary font-semibold text-on-primary shadow'
                      : 'text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name={pathway.icon} size={18} />
                    {pathway.label.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          role="tabpanel"
          id={`panel-${current.id}`}
          aria-labelledby={`tab-${current.id}`}
          className="grid grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-4"
        >
          {current.stages.map((stage) => (
            <div
              key={stage.stage}
              className="group relative flex-col overflow-hidden rounded bg-surface-container p-space-lg shadow-md transition-colors hover:bg-surface-container-high"
            >
              <div className="mb-space-md flex items-center justify-between">
                <span className="rounded bg-surface-container-lowest px-2.5 py-1 font-mono text-label-md uppercase text-primary">
                  {stage.stage}
                </span>
                <Icon name={stage.icon} size={28} className="text-primary" />
              </div>

              <h3 className="mb-space-xs font-display text-headline-sm text-on-surface">
                {stage.title}
              </h3>

              <p className="flex-grow text-body-sm text-on-surface-variant">{stage.body}</p>

              {stage.detail ? (
                <div className="mt-space-sm border-t border-outline-variant/30 pt-space-sm font-mono text-label-sm text-outline">
                  {stage.detail}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Exported so the page can render the same pathway data elsewhere. */
export { pathways };
