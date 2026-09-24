'use client';

import * as React from 'react';
import Link from 'next/link';

import { Icon } from '@/components/ui/icon';

/**
 * Route-segment error boundary for the whole app shell.
 *
 * Chain reads against the public Robinhood testnet RPC can stall or reject; a
 * raw crash there used to blank the page. This keeps the header/footer shell
 * (it lives one level above the group layout that renders them) and explains
 * the likely cause instead of leaving the viewer staring at a stack trace.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Surface to the browser console so the digest can be traced; a real deploy
    // would forward this to the configured error service.
    console.error('[ProtoRWA] route error:', error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-space-md px-space-lg py-24 lg:px-margin">
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-error/10 text-error">
        <Icon name="report" size={24} />
      </span>
      <h1 className="font-display text-headline-md font-semibold text-on-surface">
        Something broke while loading this view
      </h1>
      <p className="text-body-md text-on-surface-variant">
        On-chain reads against the Robinhood testnet RPC can time out or reject
        under load. That usually clears on a retry. If it keeps happening, the
        explorer link below tells you whether the chain itself is reachable.
      </p>
      <div className="flex flex-wrap items-center gap-space-sm pt-space-xs">
        <button
          type="button"
          onClick={() => reset()}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-space-md py-2 font-mono text-label-sm font-semibold uppercase text-on-primary transition-colors hover:bg-primary-fixed"
        >
          <Icon name="refresh" size={16} />
          Try again
        </button>
        <Link
          href="/explore"
          className="flex items-center gap-1.5 rounded-lg border border-outline-variant px-space-md py-2 font-mono text-label-sm uppercase text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <Icon name="explore" size={16} />
          Back to Explore
        </Link>
      </div>
      {error.digest ? (
        <p className="font-mono text-label-sm text-outline">Reference: {error.digest}</p>
      ) : null}
    </div>
  );
}
