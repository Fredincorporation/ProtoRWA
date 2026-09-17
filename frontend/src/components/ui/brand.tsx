import { cn } from '@/lib/utils';

/**
 * ProtoRWA brand mark.
 *
 * The Stitch project ships a raster logo, but the design also establishes the
 * mark as a geometric glyph in the primary colour. Rendering it inline keeps it
 * crisp at any size and avoids shipping a bitmap.
 */
export function BrandMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn('shrink-0', className)}
    >
      {/* Outer containment ring - the escrow boundary. */}
      <circle cx="16" cy="16" r="14.5" stroke="#10b981" strokeWidth="1.5" opacity="0.5" />
      {/* Inner ring - the milestone release path. */}
      <circle cx="16" cy="16" r="9" stroke="#4edea3" strokeWidth="1.5" />
      {/* Core block - the tokenized hardware unit. */}
      <rect x="12.5" y="12.5" width="7" height="7" rx="1" fill="#4edea3" />
      {/* Release markers at the cardinal points. */}
      <circle cx="16" cy="1.5" r="1.5" fill="#10b981" />
      <circle cx="16" cy="30.5" r="1.5" fill="#10b981" />
      <circle cx="1.5" cy="16" r="1.5" fill="#10b981" />
      <circle cx="30.5" cy="16" r="1.5" fill="#10b981" />
    </svg>
  );
}

/** Brand lockup: mark plus wordmark and protocol subtitle. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-space-sm', className)}>
      <BrandMark />
      <div className="flex flex-col">
        <span className="font-display text-headline-sm uppercase leading-none tracking-tight text-on-surface">
          ProtoRWA
        </span>
        <span className="mt-0.5 font-mono text-label-sm uppercase tracking-widest text-primary">
          Physical RWA Protocol
        </span>
      </div>
    </div>
  );
}
