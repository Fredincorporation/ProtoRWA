import Link from 'next/link';

import { Icon } from '@/components/ui/icon';

/**
 * 404 view for the app shell. Renders with the standard header/footer via the
 * (marketing) layout, so the viewer keeps their navigation context.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-space-md px-space-lg py-24 lg:px-margin">
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-container text-primary">
        <Icon name="search_off" size={24} />
      </span>
      <h1 className="font-display text-headline-md font-semibold text-on-surface">
        Nothing minted at this address
      </h1>
      <p className="text-body-md text-on-surface-variant">
        That page does not exist, or a project behind it was removed from the
        registry. Pick up from a known surface instead.
      </p>
      <div className="flex flex-wrap items-center gap-space-sm pt-space-xs">
        <Link
          href="/explore"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-space-md py-2 font-mono text-label-sm font-semibold uppercase text-on-primary transition-colors hover:bg-primary-fixed"
        >
          <Icon name="explore" size={16} />
          Explore projects
        </Link>
        <Link
          href="/market"
          className="flex items-center gap-1.5 rounded-lg border border-outline-variant px-space-md py-2 font-mono text-label-sm uppercase text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <Icon name="show_chart" size={16} />
          Secondary market
        </Link>
      </div>
    </div>
  );
}
