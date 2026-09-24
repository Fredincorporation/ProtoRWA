import type { Metadata } from 'next';

import { FounderWizard } from '@/components/studio/founder-wizard';

export const metadata: Metadata = {
  title: 'Create a Project',
  description:
    'Register a hardware build, set the raise structure, and define the milestone schedule that gates escrow release.',
};

/**
 * Founder Studio - create project.
 *
 * The header states plainly that this is a preview, so nobody mistakes a
 * validated draft for a live raise.
 */
export default function NewProjectPage() {
  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <div className="mb-1 font-mono text-label-md uppercase tracking-widest text-primary">
            {'//'} Founder Studio
          </div>
          <h1 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
            Register a Hardware Build
          </h1>
          <p className="mt-2 max-w-3xl text-body-md text-on-surface-variant">
            Four steps to a fundable project: describe the hardware, upload the
            media backers judge it by, set the raise structure, then define the
            milestone schedule that releases escrow. Capital reaches you tranche
            by tranche, against evidence your backers approve.
          </p>
        </div>
      </header>

      <FounderWizard />
    </>
  );
}
