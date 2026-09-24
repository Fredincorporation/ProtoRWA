import { Icon } from '@/components/ui/icon';

/**
 * Route-segment loading skeleton for the app shell.
 *
 * Server components under this group read from the chain, so the first paint
 * after navigation can wait on an RPC call. This gives the viewer an honest
 * "reading from chain" indicator instead of an empty flash.
 */
export default function MarketingLoading() {
  return (
    <div className="mx-auto max-w-7xl px-space-lg py-24 lg:px-margin">
      <div className="flex items-center gap-2 font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
        <Icon name="sync" size={16} className="animate-spin text-primary" />
        Loading from chain
      </div>
      <div className="mt-space-lg grid grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-lg bg-surface-container"
            aria-hidden
          />
        ))}
      </div>
      <div className="mt-space-md h-64 animate-pulse rounded-lg bg-surface-container-lowest" aria-hidden />
    </div>
  );
}
